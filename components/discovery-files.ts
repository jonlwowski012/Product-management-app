import { discoveryFileFingerprint } from "@/lib/source-deduplication";
import {
  MAX_DISCOVERY_FILES,
  MAX_DISCOVERY_BYTES,
  MAX_DOCUMENT_BYTES,
  MAX_DIRECTORY_ENTRIES,
} from "@/lib/discovery-limits";
const supported = /\.(txt|md|markdown|vtt|srt|pdf|docx|pptx|zip)$/i;
const hidden = (name: string) =>
  name.split("/").some((part) => part.startsWith(".") || part === "__MACOSX");
type Warn = (message: string) => void;
export function selectedDiscoveryFiles(files: File[], warn: Warn = () => {}) {
  return files
    .filter((file) => !hidden(file.webkitRelativePath || file.name))
    .flatMap((file) => {
      const name = (file.webkitRelativePath || file.name).replaceAll(
        "/",
        " — ",
      );
      const problem = !supported.test(name)
        ? "unsupported format"
        : name.length > 200
          ? "filename exceeds 200 characters; shorten its folder or file name"
          : !file.size
            ? "empty file"
            : file.size >
                (name.toLowerCase().endsWith(".zip")
                  ? MAX_DISCOVERY_BYTES
                  : MAX_DOCUMENT_BYTES)
              ? "file exceeds the size limit"
              : "";
      if (problem) {
        warn(`Skipped ${name}: ${problem}.`);
        return [];
      }
      return [
        name === file.name
          ? file
          : new File([file], name, {
              type: file.type,
              lastModified: file.lastModified,
            }),
      ];
    });
}
export async function droppedDiscoveryFiles(
  items: DataTransferItem[],
  fallback: File[],
  warn: Warn = () => {},
  scanned: (count: number) => void = () => {},
) {
  const entries = items.map((item) => item.webkitGetAsEntry?.());
  if (!entries.some(Boolean)) return selectedDiscoveryFiles(fallback, warn);
  const files: File[] = [];
  const seen = new Map<string, string>();
  let visited = 0,
    bytes = 0;
  async function visit(entry: FileSystemEntry, parent = "") {
    if (++visited > MAX_DIRECTORY_ENTRIES)
      throw new Error(
        "Folders may contain at most 20,000 entries. Select a smaller folder.",
      );
    if (visited % 50 === 0) scanned(visited);
    const relative = parent + entry.name;
    if (hidden(relative)) return;
    if (entry.isFile) {
      try {
        const file = await new Promise<File>((resolve, reject) =>
          (entry as FileSystemFileEntry).file(resolve, reject),
        );
        const accepted = selectedDiscoveryFiles(
          [
            new File([file], relative.replaceAll("/", " — "), {
              type: file.type,
              lastModified: file.lastModified,
            }),
          ],
          warn,
        );
        for (const f of accepted) {
          const fingerprint = await discoveryFileFingerprint(f);
          const previous = seen.get(fingerprint);
          if (previous) {
            warn(
              `Skipped duplicate ${f.name}: identical content to ${previous}.`,
            );
            continue;
          }
          seen.set(fingerprint, f.name);
          files.push(f);
          bytes += f.size;
        }
      } catch {
        warn(`Skipped ${relative}: file could not be read.`);
      }
      if (files.length > MAX_DISCOVERY_FILES)
        throw new Error("Import at most 1,000 documents at a time.");
      if (bytes > MAX_DISCOVERY_BYTES)
        throw new Error("Combined files must be smaller than 500 MB.");
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      while (true) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject),
        );
        if (!batch.length) break;
        for (const child of batch) await visit(child, relative + "/");
      }
    }
  }
  for (const entry of entries) if (entry) await visit(entry);
  scanned(visited);
  return files;
}
// Expand ZIPs locally so each document gets its own bounded upload and parsing request.
export async function prepareDiscoveryFiles(
  incoming: File[],
  warn: Warn,
  scanned: (count: number) => void = () => {},
  accept: (file: File, fingerprint: string) => boolean = () => true,
) {
  const files: File[] = [];
  const seen = new Map<string, string>();
  let bytes = 0;
  async function append(file: File) {
    const fingerprint = await discoveryFileFingerprint(file);
    const previous = seen.get(fingerprint);
    if (previous) {
      warn(`Skipped duplicate ${file.name}: identical content to ${previous}.`);
      return;
    }
    seen.set(fingerprint, file.name);
    if (!accept(file, fingerprint)) return;
    if (files.length >= MAX_DISCOVERY_FILES)
      throw new Error("Import at most 1,000 documents after expanding ZIPs.");
    if (bytes + file.size > MAX_DISCOVERY_BYTES)
      throw new Error("Combined expanded files must be smaller than 500 MB.");
    bytes += file.size;
    files.push(file);
    scanned(files.length);
  }
  for (const file of selectedDiscoveryFiles(incoming, warn)) {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      await append(file);
      continue;
    }
    const { ZipReader, BlobReader } = await import("@zip.js/zip.js");
    const reader = new ZipReader(new BlobReader(file), {
      useWebWorkers: false,
      checkSignature: true,
      strictness: "strict",
      checkOverlappingEntry: true,
    });
    const extracted: File[] = [];
    let count = 0,
      expanded = 0;
    try {
      for await (const entry of reader.getEntriesGenerator()) {
        if (++count > MAX_DIRECTORY_ENTRIES)
          throw new Error("ZIP exceeds 20,000 entries.");
        const name = entry.filename;
        if (
          name.startsWith("/") ||
          name.includes("\\") ||
          name.split("/").includes("..") ||
          /[:\x00-\x1f]/.test(name) ||
          entry.symlink
        )
          throw new Error("Unsafe archive path rejected.");
        if (entry.directory || hidden(name)) continue;
        if (!supported.test(name) || name.toLowerCase().endsWith(".zip")) {
          warn(`Skipped ${file.name} — ${name}: unsupported format.`);
          continue;
        }
        if (entry.encrypted) {
          warn(`Skipped ${file.name} — ${name}: password-protected file.`);
          continue;
        }
        if (
          !entry.uncompressedSize ||
          entry.uncompressedSize > MAX_DOCUMENT_BYTES
        ) {
          warn(
            `Skipped ${file.name} — ${name}: empty file or larger than 10 MB.`,
          );
          continue;
        }
        if (expanded + bytes + entry.uncompressedSize > MAX_DISCOVERY_BYTES)
          throw new Error(
            "ZIP exceeds the 1,000-document or 500 MB import limit.",
          );
        const display = name.replaceAll("/", " — ");
        if (display.length > 200) {
          warn(`Skipped ${name}: filename exceeds 200 characters.`);
          continue;
        }
        let size = 0;
        const chunks: Uint8Array<ArrayBuffer>[] = [];
        await entry.getData(
          new WritableStream<Uint8Array<ArrayBuffer>>({
            write(chunk) {
              size += chunk.length;
              if (size > MAX_DOCUMENT_BYTES || size > entry.uncompressedSize)
                throw new Error("Expanded ZIP entry exceeds its size limit.");
              chunks.push(chunk);
            },
          }),
        );
        if (size !== entry.uncompressedSize)
          throw new Error("Invalid ZIP entry size.");
        expanded += size;
        extracted.push(
          new File(chunks, display, {
            lastModified: entry.lastModDate.getTime(),
          }),
        );
        scanned(files.length + extracted.length);
      }
      if (!extracted.length)
        warn(`Skipped ${file.name}: no supported documents found.`);
    } catch (error) {
      warn(
        `Skipped ${file.name}: ${error instanceof Error ? error.message : "invalid ZIP archive"}`,
      );
      extracted.length = 0;
    } finally {
      await reader.close();
    }
    for (const extractedFile of extracted) await append(extractedFile);
  }
  return files;
}
