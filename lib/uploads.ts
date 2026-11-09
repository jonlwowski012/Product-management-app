import { head, get } from "@vercel/blob";
import {
  query,
  transaction,
  AppError,
  id,
  owned,
  assertWritableUser,
} from "./db";
import { decodeFiles, ingestFiles, MAX_UPLOAD } from "./ingest";
import { blobEnabled } from "./storage";
export async function reserveUploads(
  user: string,
  customer: string | null,
  title: string,
  files: { name: string; size: number }[],
  discovery = false,
) {
  await assertWritableUser(user);
  if (!blobEnabled())
    throw new AppError("Private Blob storage is not configured", 503);
  if (!discovery) await owned("customers", customer!, user);
  if (files.reduce((n, f) => n + f.size, 0) > MAX_UPLOAD)
    throw new AppError("Combined uploads exceed 10 MB");
  return transaction(async (c) => {
    await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user]);
    const {
      rows: [count],
    } = await c.query(
      "SELECT count(*)::int AS n FROM upload_reservations WHERE user_id=$1 AND expires_at>now() AND state IN ('pending','processing')",
      [user],
    );
    if (count.n + files.length > 60)
      throw new AppError("Too many unfinished uploads; try again later", 429);
    const reservations = [];
    for (const file of files) {
      const uid = id(),
        pathname = `incoming/${user}/${uid}/${file.name}`;
      await c.query(
        "INSERT INTO upload_reservations(id,user_id,customer_id,filename,title,pathname,expected_size,discovery) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [uid, user, customer, file.name, title, pathname, file.size, discovery],
      );
      reservations.push({ id: uid, pathname });
    }
    return { reservations };
  });
}
export async function reservation(uid: string, user?: string) {
  const [r] = await query(
    "SELECT * FROM upload_reservations WHERE id=$1" +
      (user ? " AND user_id=$2" : ""),
    user ? [uid, user] : [uid],
  );
  if (!r) throw new AppError("Upload not found", 404);
  if (r.state !== "completed" && new Date(r.expires_at) < new Date())
    throw new AppError("Upload expired; select your file again", 410);
  return r;
}
export async function completeUpload(uid: string, user?: string) {
  const r = await reservation(uid, user);
  await assertWritableUser(r.user_id);
  if (r.state === "completed") return r.result;
  const [claimed] = await query(
    "UPDATE upload_reservations SET state='processing',locked_at=now() WHERE id=$1 AND (state IN ('pending','failed') OR locked_at<now()-interval '5 minutes') RETURNING id",
    [uid],
  );
  if (!claimed)
    throw new AppError("Upload is being processed; retry shortly", 409);
  try {
    // Read only the server-reserved pathname. Never fetch a client-supplied URL.
    const info = await head(r.pathname);
    if (info.size !== r.expected_size || info.size > MAX_UPLOAD)
      throw new AppError("Uploaded file size does not match its reservation");
    if (info.pathname !== r.pathname)
      throw new AppError("Uploaded path mismatch", 403);
    const blob = await get(info.url, { access: "private", useCache: false });
    if (!blob || blob.statusCode !== 200)
      throw new AppError("Upload is not available yet", 409);
    const reader = blob.stream.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > r.expected_size) {
        await reader.cancel();
        throw new AppError("Upload is too large");
      }
      chunks.push(value);
    }
    if (size !== r.expected_size) throw new AppError("Upload is incomplete");
    let result;
    if (r.discovery) {
      const { discoveryUpload } = await import("./reports");
      result = await discoveryUpload(
        r.user_id,
        r.filename,
        Buffer.concat(chunks),
        "blob:" + info.url,
        "blob:" + r.pathname,
      );
    } else {
      const files = decodeFiles(r.filename, Buffer.concat(chunks));
      result = await ingestFiles(r.user_id, r.customer_id, r.title, files);
    }
    await transaction(async (c) => {
      await c.query(
        "UPDATE upload_reservations SET state='completed',result=$1,blob_url=$2,error=NULL WHERE id=$3",
        [JSON.stringify(result), info.url, uid],
      );
      if (
        !r.discovery ||
        r.filename.toLowerCase().endsWith(".zip") ||
        ("sources" in result && result.sources?.[0]?.duplicate)
      )
        await c.query(
          "INSERT INTO storage_deletions(pathname,not_before) VALUES($1,now()+interval '1 day') ON CONFLICT(pathname) DO UPDATE SET not_before=greatest(storage_deletions.not_before,excluded.not_before)",
          ["blob:" + r.pathname],
        );
    });
    return result;
  } catch (error) {
    await query(
      "UPDATE upload_reservations SET state='failed',error=$1,locked_at=NULL WHERE id=$2",
      [
        error instanceof AppError
          ? error.message
          : "Upload processing interrupted; retry available",
        uid,
      ],
    );
    throw error;
  }
}
export async function expireUploads() {
  await transaction(async (c) => {
    const { rows } = await c.query(
      "DELETE FROM upload_reservations WHERE expires_at<now() AND (state<>'processing' OR locked_at<now()-interval '5 minutes') RETURNING pathname",
    );
    for (const r of rows)
      await c.query(
        "INSERT INTO storage_deletions(pathname,not_before) VALUES($1,now()+interval '1 day') ON CONFLICT(pathname) DO UPDATE SET not_before=greatest(storage_deletions.not_before,excluded.not_before)",
        ["blob:" + r.pathname],
      );
  });
}
