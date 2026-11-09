import path from "node:path";
import AdmZip from "adm-zip";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { AppError } from "./db";
import { decodeFiles, MAX_UPLOAD } from "./ingest";
import type { SourcePage } from "./opportunities";

export const discoveryExtensions =
  /\.(txt|md|markdown|vtt|srt|pdf|pptx|docx)$/i;
export function discoveryFiles(
  name: string,
  buffer: Buffer,
  warn: (message: string) => void = () => {},
) {
  if (!name.toLowerCase().endsWith(".zip")) {
    if (!discoveryExtensions.test(name)) {
      warn(`Skipped ${name.slice(0, 200)}: unsupported format.`);
      return [];
    }
    return [{ name, buffer }];
  }
  if (!buffer.length || buffer.length > MAX_UPLOAD)
    throw new AppError("Each ZIP must be between 1 byte and 10 MB.");
  try {
    const entries = new AdmZip(buffer).getEntries();
    if (entries.length > 1000)
      throw new AppError("ZIP archives may contain at most 1,000 entries.");
    let total = 0;
    const files = [];
    for (const entry of entries) {
      const filename = entry.entryName;
      if (
        filename.startsWith("/") ||
        filename.includes("\\") ||
        filename.split("/").includes("..") ||
        /[:\x00-\x1f]/.test(filename) ||
        ((entry.attr >>> 16) & 0xf000) === 0xa000
      )
        throw new AppError("Unsafe archive path rejected.");
      if (
        entry.isDirectory ||
        filename
          .split("/")
          .some((part) => part.startsWith(".") || part === "__MACOSX")
      )
        continue;
      if (!discoveryExtensions.test(filename)) {
        warn(`Skipped ${filename.slice(0, 200)}: unsupported format.`);
        continue;
      }
      if (entry.header.flags & 1)
        throw new AppError("Password-protected ZIP files are not supported.");
      total += entry.header.size;
      if (total > MAX_UPLOAD)
        throw new AppError("Expanded ZIP contents exceed 10 MB.");
      if (files.length >= 30)
        throw new AppError("Import at most 30 documents per ZIP.");
      const displayName = filename.replaceAll("/", " — ");
      if (displayName.length > 200)
        throw new AppError(
          "A ZIP filename is too long. Shorten its folder or file name.",
        );
      files.push({ name: displayName, entry });
    }
    if (!files.length)
      throw new AppError(
        "The ZIP contains no supported transcripts or documents.",
      );
    return files.map(({ name, entry }) => {
      const data = entry.getData();
      if (data.length !== entry.header.size)
        throw new AppError("Invalid ZIP entry size.");
      return { name, buffer: data };
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Invalid ZIP archive. Export a new ZIP and try again.");
  }
}
export async function readDocument(
  name: string,
  buffer: Buffer,
): Promise<{ pages: SourcePage[]; warnings: string[] }> {
  if (!discoveryExtensions.test(name))
    throw new AppError(
      "Use TXT, Markdown, VTT, SRT, PDF, DOCX, or PPTX files.",
    );
  if (!buffer.length || buffer.length > MAX_UPLOAD)
    throw new AppError("Each file must be between 1 byte and 10 MB.");
  const ext = path.extname(name).toLowerCase();
  let pages: SourcePage[] = [],
    warnings: string[] = [];
  try {
    if (ext === ".pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({
        data: new Uint8Array(buffer),
        isEvalSupported: false,
      });
      try {
        const info = await parser.getInfo();
        if (info.total > 200)
          throw new AppError(
            "PDFs may contain at most 200 pages. Split this document first.",
          );
        const result = await parser.getText();
        pages = result.pages.map((p) => ({
          label: `Page ${p.num}`,
          text: p.text,
        }));
      } finally {
        await parser.destroy();
      }
      warnings.push(
        "Only extractable text was read. Images, charts, and scanned text require OCR and are not analyzed.",
      );
    } else if (ext === ".pptx" || ext === ".docx") {
      const zip = new AdmZip(buffer),
        entries = zip.getEntries();
      if (
        entries.length > 3000 ||
        entries.reduce((n, e) => n + e.header.size, 0) > 40 * 1024 * 1024
      )
        throw new AppError("Expanded document exceeds the processing limit.");
      const parser = new XMLParser({
        preserveOrder: true,
        ignoreAttributes: true,
        parseTagValue: false,
        processEntities: false,
      });
      function texts(nodes: any): string {
        if (!Array.isArray(nodes)) return "";
        return nodes
          .map((node) =>
            Object.entries(node)
              .map(([tag, value]) => {
                if (tag === "#text")
                  return String(value).replace(
                    /&(?:amp|lt|gt|quot|apos);/g,
                    (e) =>
                      ({
                        "&amp;": "&",
                        "&lt;": "<",
                        "&gt;": ">",
                        "&quot;": '"',
                        "&apos;": "'",
                      })[e]!,
                  );
                return (
                  texts(value) +
                  (tag.endsWith(":p") ? "\n" : tag.endsWith(":tab") ? "\t" : "")
                );
              })
              .join(""),
          )
          .join("");
      }
      let selected = entries.filter((e) => e.entryName === "word/document.xml");
      if (ext === ".pptx") {
        const metadataParser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: "",
          parseTagValue: false,
          processEntities: false,
        });
        function metadata(name: string) {
          const entry = zip.getEntry(name);
          if (!entry || entry.header.size > 2 * 1024 * 1024)
            throw new AppError(
              "Presentation slide order is unavailable. Export the slides as a PDF.",
            );
          const xml = entry.getData().toString("utf8");
          if (
            /<!DOCTYPE|<!ENTITY/i.test(xml) ||
            XMLValidator.validate(xml) !== true
          )
            throw new AppError("Invalid presentation metadata.");
          return metadataParser.parse(xml);
        }
        const local = (object: any, name: string): any =>
          Object.entries(object ?? {}).find(
            ([key]) => key.split(":").pop() === name,
          )?.[1];
        const array = (value: any): any[] =>
          value === undefined ? [] : Array.isArray(value) ? value : [value];
        const presentation = local(
          metadata("ppt/presentation.xml"),
          "presentation",
        );
        const ids = array(local(local(presentation, "sldIdLst"), "sldId"));
        const relationships = array(
          local(
            local(metadata("ppt/_rels/presentation.xml.rels"), "Relationships"),
            "Relationship",
          ),
        );
        selected = ids.map((slide) => {
          const rid = Object.entries(slide).find(([key]) =>
            key.endsWith(":id"),
          )?.[1];
          const relationship = relationships.find((r) => r.Id === rid);
          if (
            !relationship ||
            relationship.TargetMode === "External" ||
            typeof relationship.Target !== "string"
          )
            throw new AppError("Invalid slide relationship.");
          const target = path.posix.normalize(
            relationship.Target.startsWith("/")
              ? relationship.Target.slice(1)
              : "ppt/" + relationship.Target,
          );
          if (!/^ppt\/slides\/[^/]+\.xml$/.test(target))
            throw new AppError("Unsupported slide relationship.");
          const entry = zip.getEntry(target);
          if (!entry)
            throw new AppError("A slide is missing from this presentation.");
          return entry;
        });
      }
      if (selected.length > 200)
        throw new AppError("Presentations may contain at most 200 slides.");
      pages = selected.map((e, i) => {
        const data = e.getData();
        if (data.length !== e.header.size || data.length > 10 * 1024 * 1024)
          throw new AppError("Invalid document entry.");
        const xml = data.toString("utf8");
        if (
          /<!DOCTYPE|<!ENTITY/i.test(xml) ||
          XMLValidator.validate(xml) !== true
        )
          throw new AppError("Invalid document XML.");
        return {
          label: ext === ".pptx" ? `Slide ${i + 1}` : "Document text",
          text: texts(parser.parse(xml)).trim(),
        };
      });
      warnings.push(
        "Only document text was read. Images, charts, comments, and speaker notes are not analyzed.",
      );
    } else
      pages = decodeFiles(name, buffer).map((f) => ({
        label: "Original text",
        text: f.text,
      }));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "This document could not be read. Export an unlocked, text-based PDF, DOCX, PPTX, or plain text file.",
    );
  }
  if (!pages.some((p) => p.text.trim().length >= 5))
    throw new AppError(
      "No readable text found. Scanned or image-only documents need OCR first.",
    );
  if (pages.reduce((n, p) => n + p.text.length, 0) > 500000)
    throw new AppError(
      "Document contains too much text. Split it into smaller files.",
    );
  for (const p of pages)
    if (p.text.trim().length < 5)
      warnings.push(
        `${p.label} has no readable text and could not be analyzed.`,
      );
  return { pages, warnings };
}
