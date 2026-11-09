import { put, get, del } from "@vercel/blob";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { query, AppError } from "./db";
export const blobEnabled = () =>
  !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
export async function storeOriginal(user: string, tid: string, text: string) {
  if (blobEnabled()) {
    const pathname = `originals/${user}/${tid}.txt`;
    await query(
      "INSERT INTO storage_deletions(pathname,transcript_id,not_before) VALUES($1,$2,now()+interval '1 day') ON CONFLICT DO NOTHING",
      ["blob:" + pathname, tid],
    );
    const blob = await put(pathname, text, {
      access: "private",
      addRandomSuffix: false,
      contentType: "text/plain; charset=utf-8",
    });
    return "blob:" + blob.url;
  }
  if (process.env.VERCEL)
    throw new AppError("Private Blob storage is not configured", 503);
  const folder = path.resolve(process.env.DATA_DIR ?? ".data", "uploads", user);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const file = path.join(folder, tid + ".txt");
  await writeFile(file, text, { mode: 0o600 });
  return file;
}
export async function originalStream(storage: string, raw: string) {
  if (storage.startsWith("blob:")) {
    const blob = await get(storage.slice(5), {
      access: "private",
      useCache: false,
    });
    if (!blob || blob.statusCode !== 200)
      throw new AppError("Original source unavailable", 503);
    return blob.stream;
  }
  return new Blob([raw]).stream();
}
export async function deleteStored(storage: string) {
  if (storage.startsWith("blob:")) await del(storage.slice(5));
  else
    await unlink(storage).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
}
export async function scheduleDeletion(storage: string, delayMs = 0) {
  await query(
    "INSERT INTO storage_deletions(pathname,not_before) VALUES($1,now()+($2::bigint * interval '1 millisecond')) ON CONFLICT(pathname) DO UPDATE SET not_before=greatest(storage_deletions.not_before,excluded.not_before)",
    [storage, delayMs],
  );
}
export async function cleanStorage() {
  const rows = await query(
    "SELECT pathname,transcript_id,xmin::text AS version FROM storage_deletions WHERE not_before<=now() ORDER BY attempts,not_before,created_at LIMIT 50",
  );
  for (const row of rows) {
    try {
      const [used] = await query(
        "SELECT id FROM transcripts WHERE id=$1 OR storage_path=$2 UNION ALL SELECT id FROM discovery_sources WHERE storage_path=$2 OR storage_key=$2 LIMIT 1",
        [row.transcript_id, row.pathname],
      );
      if (!used) await deleteStored(row.pathname);
      await query(
        "DELETE FROM storage_deletions WHERE pathname=$1 AND xmin::text=$2",
        [row.pathname, row.version],
      );
    } catch {
      await query(
        "UPDATE storage_deletions SET attempts=attempts+1,not_before=greatest(not_before,now()+interval '15 minutes') WHERE pathname=$1",
        [row.pathname],
      );
    }
  }
  return rows.length;
}
