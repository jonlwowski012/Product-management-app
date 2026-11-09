import { createHash } from "node:crypto";
import path from "node:path";
import AdmZip from "adm-zip";
import { query, owned, AppError, id, audit, assertWritableUser } from "./db";
import { parseTranscript } from "./domain";
import { storeOriginal, scheduleDeletion } from "./storage";
export const MAX_UPLOAD = 10 * 1024 * 1024;
function decodeUtf8(data: Buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      data,
    );
  } catch {
    throw new AppError("Transcripts must contain valid UTF-8 text");
  }
}
export function decodeFiles(name: string, buffer: Buffer) {
  const files: { name: string; text: string }[] = [];
  if (buffer.length > MAX_UPLOAD)
    throw new AppError("Each upload must be smaller than 10 MB");
  if (name.toLowerCase().endsWith(".zip")) {
    let zip: AdmZip;
    try {
      zip = new AdmZip(buffer);
    } catch {
      throw new AppError("Invalid ZIP archive");
    }
    const entries = zip.getEntries();
    if (entries.length > 100)
      throw new AppError("ZIP archives may contain at most 100 entries");
    let total = 0;
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const filename = entry.entryName;
      if (
        filename.includes("..") ||
        filename.startsWith("/") ||
        filename.includes("\\")
      )
        throw new AppError("Unsafe archive path rejected");
      if (!/\.(txt|md|markdown|vtt|srt)$/i.test(filename))
        throw new AppError("ZIP contains an unsupported file type");
      total += entry.header.size;
      if (total > MAX_UPLOAD)
        throw new AppError("Expanded uploads exceed 10 MB");
      let data: Buffer;
      try {
        data = entry.getData();
      } catch {
        throw new AppError("Invalid ZIP entry");
      }
      if (data.length !== entry.header.size)
        throw new AppError("Invalid ZIP entry size");
      files.push({ name: path.basename(filename), text: decodeUtf8(data) });
    }
  } else {
    if (!/\.(txt|md|markdown|vtt|srt)$/i.test(name))
      throw new AppError("Supported formats: TXT, Markdown, VTT, SRT, ZIP");
    try {
      files.push({ name: path.basename(name), text: decodeUtf8(buffer) });
    } catch {
      throw new AppError("Transcripts must contain valid UTF-8 text");
    }
  }
  return files;
}
export async function ingestFiles(
  user: string,
  customer: string,
  title: string,
  files: { name: string; text: string }[],
) {
  await assertWritableUser(user);
  await owned("customers", customer, user);
  if (!files.length) throw new AppError("The archive contains no transcripts");
  const results = [];
  for (const file of files) {
    if (
      file.text.trim().length < 5 ||
      file.text.includes("\0") ||
      file.text.includes("\uFFFD")
    )
      throw new AppError("Transcripts must contain valid UTF-8 text");
    const hash = createHash("sha256").update(file.text).digest("hex");
    const [existing] = await query(
      "SELECT id,title FROM transcripts WHERE user_id=$1 AND sha256=$2",
      [user, hash],
    );
    if (existing) {
      results.push({ ...existing, duplicate: true });
      continue;
    }
    const tid = id();
    const storage = await storeOriginal(user, tid, file.text);
    try {
      await query(
        "INSERT INTO transcripts(id,user_id,customer_id,title,filename,sha256,raw_text,segments,storage_path) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          tid,
          user,
          customer,
          (title || file.name).slice(0, 200),
          file.name,
          hash,
          file.text,
          JSON.stringify(parseTranscript(file.text)),
          storage,
        ],
      );
      results.push({ id: tid, title: title || file.name, duplicate: false });
    } catch (e) {
      await scheduleDeletion(storage);
      if ((e as { code: string }).code === "23505") {
        const [row] = await query(
          "SELECT id,title FROM transcripts WHERE user_id=$1 AND sha256=$2",
          [user, hash],
        );
        results.push({ ...row, duplicate: true });
      } else throw e;
    }
    await audit(user, "Transcript imported", "transcript", tid, {
      filename: file.name,
    });
  }
  return { transcripts: results };
}
