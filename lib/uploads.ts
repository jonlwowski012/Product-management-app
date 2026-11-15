import { createHash } from "node:crypto";
import {
  query,
  transaction,
  AppError,
  id,
  owned,
  assertWritableUser,
} from "./db";
import { decodeFiles, ingestFiles, MAX_UPLOAD } from "./ingest";
import { blobEnabled, netlifyStorage, readUpload, uploadKey } from "./storage";
import { lockSourceWrite } from "./source-write";
import { signUploadTicket } from "./upload-ticket";
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
        key = `incoming/${user}/${uid}/${file.name}`,
        pathname = netlifyStorage() ? "netlify:" + key : key;
      const expires = netlifyStorage() ? Date.now() + 10 * 60 * 1000 : null;
      await c.query(
        "INSERT INTO upload_reservations(id,user_id,customer_id,filename,title,pathname,expected_size,discovery,token_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          uid,
          user,
          customer,
          file.name,
          title,
          pathname,
          file.size,
          discovery,
          expires === null ? null : new Date(expires),
        ],
      );
      reservations.push({
        id: uid,
        pathname,
        ...(expires !== null
          ? {
              uploadToken: signUploadTicket(
                key,
                file.size,
                expires,
                process.env.APP_SECRET || "",
              ),
            }
          : {}),
      });
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
  const claim = { id: uid, token: id() };
  const claimed = await transaction(async (c) => {
    await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [r.user_id]);
    const result = await c.query(
      "UPDATE upload_reservations SET state='processing',locked_at=clock_timestamp(),processing_token=$2 WHERE id=$1 AND expires_at>clock_timestamp() AND (state IN ('pending','failed') OR (state='processing' AND locked_at<clock_timestamp()-interval '5 minutes')) RETURNING id",
      [uid, claim.token],
    );
    return !!result.rowCount;
  });
  if (!claimed)
    throw new AppError("Upload is being processed; retry shortly", 409);
  try {
    // Read only the server-reserved pathname. Never fetch a client-supplied URL.
    const blob = await readUpload(r.pathname);
    if (blob.size !== r.expected_size || blob.size > MAX_UPLOAD)
      throw new AppError("Uploaded file size does not match its reservation");
    if (blob.pathname !== r.pathname)
      throw new AppError("Uploaded path mismatch", 403);
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
    const recordHashes = (hashes: string[]) =>
      transaction(async (c) => {
        await lockSourceWrite(c, r.user_id, { claim });
        await c.query(
          "UPDATE upload_reservations SET source_hashes=$1 WHERE id=$2",
          [hashes, uid],
        );
      });
    let result;
    if (r.discovery) {
      const { discoveryUpload } = await import("./reports");
      result = await discoveryUpload(
        r.user_id,
        r.filename,
        Buffer.concat(chunks),
        blob.storage,
        uploadKey(r.pathname),
        { claim, recordHashes },
      );
    } else {
      const files = decodeFiles(r.filename, Buffer.concat(chunks));
      await recordHashes(
        files.map((file) =>
          createHash("sha256")
            .update(Buffer.from(file.text).toString("base64"))
            .digest("hex"),
        ),
      );
      result = await ingestFiles(r.user_id, r.customer_id, r.title, files, {
        claim,
      });
    }
    await transaction(async (c) => {
      await lockSourceWrite(c, r.user_id, { claim });
      await c.query(
        "UPDATE upload_reservations SET state='completed',result=$1,blob_url=$2,error=NULL,processing_token=NULL WHERE id=$3",
        [
          JSON.stringify(result),
          blob.storage.startsWith("netlify:")
            ? blob.storage
            : blob.storage.slice(5),
          uid,
        ],
      );
      if (
        !r.discovery ||
        r.filename.toLowerCase().endsWith(".zip") ||
        ("sources" in result && result.sources?.[0]?.duplicate)
      )
        await c.query(
          "INSERT INTO storage_deletions(pathname,not_before) VALUES($1,now()+interval '1 day') ON CONFLICT(pathname) DO NOTHING",
          [uploadKey(r.pathname)],
        );
    });
    return result;
  } catch (error) {
    await transaction(async (c) => {
      const failed = await c.query(
        "UPDATE upload_reservations SET state='failed',error=$1,locked_at=NULL,processing_token=NULL WHERE id=$2 AND processing_token=$3",
        [
          error instanceof AppError
            ? error.message
            : "Upload processing interrupted; retry available",
          uid,
          claim.token,
        ],
      );
      if (failed.rowCount)
        await c.query(
          "INSERT INTO storage_deletions(pathname,not_before) VALUES($1,now()+interval '1 day') ON CONFLICT DO NOTHING",
          [uploadKey(r.pathname)],
        );
    });
    throw error;
  }
}
export async function expireUploads() {
  await transaction(async (c) => {
    const { rows } = await c.query(
      "DELETE FROM upload_reservations WHERE expires_at<now() AND coalesce(token_expires_at,expires_at)<now()-interval '5 minutes' AND (state<>'processing' OR locked_at<now()-interval '5 minutes') AND NOT EXISTS(SELECT 1 FROM storage_deletions WHERE pathname=CASE WHEN upload_reservations.pathname LIKE 'netlify:%' THEN upload_reservations.pathname ELSE 'blob:' || upload_reservations.pathname END) RETURNING pathname,state",
    );
    for (const r of rows) {
      if (r.state === "completed") continue;
      await c.query(
        "INSERT INTO storage_deletions(pathname,not_before) VALUES($1,now()+interval '1 day') ON CONFLICT(pathname) DO NOTHING",
        [uploadKey(r.pathname)],
      );
    }
  });
}
