import "dotenv/config";
import pg from "pg";
import { put } from "@vercel/blob";
import { getStore } from "@netlify/blobs";
const netlifyStore = () =>
  getStore({
    name: "evidence-originals",
    consistency: "strong",
    siteID: process.env.NETLIFY_BLOBS_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN,
  });
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const source = process.argv[2];
if (!source || !process.env.DATABASE_URL)
  throw new Error(
    "Usage: npm run restore -- /backup/directory; set DATABASE_URL to an empty database",
  );
const manifest = JSON.parse(
  await readFile(path.resolve(source, "manifest.json"), "utf8"),
);
if (manifest.format !== 1) throw new Error("Unsupported backup format");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  const { rows } = await db.query(
    "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'",
  );
  if (rows[0].count)
    throw new Error(
      "Restore requires an empty database; existing tables will not be modified",
    );
  const sql = await readFile(path.resolve(source, "database.sql"), "utf8");
  // pg_dump emits psql meta-commands for restricted mode; data is trusted local backup input.
  const cleaned = sql
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith("\\restrict") && !line.startsWith("\\unrestrict"),
    )
    .join("\n");
  await db.query("BEGIN");
  try {
    await db.query(cleaned);
    await db.query("SET search_path TO public");
    const { rows: transcripts } = await db.query(
      "SELECT id,user_id,sha256,raw_text FROM transcripts",
    );
    for (const t of transcripts) {
      const hash = createHash("sha256").update(t.raw_text).digest("hex");
      if (hash !== t.sha256)
        throw new Error("Transcript integrity check failed");
      let file;
      if (process.env.STORAGE_PROVIDER === "netlify") {
        const pathname = `originals/${t.user_id}/${t.id}.txt`;
        await netlifyStore().set(pathname, t.raw_text, {
          metadata: { size: Buffer.byteLength(t.raw_text) },
        });
        file = "netlify:" + pathname;
      } else if (
        process.env.BLOB_READ_WRITE_TOKEN ||
        process.env.BLOB_STORE_ID
      ) {
        const blob = await put(
          `originals/${t.user_id}/${t.id}.txt`,
          t.raw_text,
          {
            access: "private",
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: "text/plain; charset=utf-8",
          },
        );
        file = "blob:" + blob.url;
      } else {
        const dir = path.resolve(
          process.env.DATA_DIR ?? ".data",
          "uploads",
          t.user_id,
        );
        await mkdir(dir, { recursive: true, mode: 0o700 });
        file = path.join(dir, hash + ".txt");
        await writeFile(file, t.raw_text, { mode: 0o600 });
      }
      await db.query("UPDATE transcripts SET storage_path=$1 WHERE id=$2", [
        file,
        t.id,
      ]);
    }
    if (
      (await db.query("SELECT to_regclass('public.discovery_sources') AS t"))
        .rows[0].t
    ) {
      const { rows: sources } = await db.query(
        "SELECT * FROM discovery_sources",
      );
      for (const sourceRecord of sources) {
        const bytes = await readFile(
          path.resolve(source, "sources", sourceRecord.id),
        );
        if (
          createHash("sha256")
            .update(bytes.toString("base64"))
            .digest("hex") !== sourceRecord.sha256
        )
          throw new Error("Discovery source integrity check failed");
        let stored,
          key = null;
        if (process.env.STORAGE_PROVIDER === "netlify") {
          const pathname = `sources/${sourceRecord.user_id}/${sourceRecord.id}`;
          await netlifyStore().set(pathname, Uint8Array.from(bytes).buffer, {
            metadata: { size: bytes.length },
          });
          stored = key = "netlify:" + pathname;
        } else if (
          process.env.BLOB_READ_WRITE_TOKEN ||
          process.env.BLOB_STORE_ID
        ) {
          const pathname = `sources/${sourceRecord.user_id}/${sourceRecord.id}`;
          const blob = await put(pathname, bytes, {
            access: "private",
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: "application/octet-stream",
          });
          stored = "blob:" + blob.url;
          key = "blob:" + pathname;
        } else {
          const folder = path.resolve(
            process.env.DATA_DIR ?? ".data",
            "sources",
            sourceRecord.user_id,
          );
          await mkdir(folder, { recursive: true, mode: 0o700 });
          stored = path.join(folder, sourceRecord.id);
          await writeFile(stored, bytes, { mode: 0o600 });
        }
        await db.query(
          "UPDATE discovery_sources SET storage_path=$1,storage_key=$2 WHERE id=$3",
          [stored, key, sourceRecord.id],
        );
      }
    }
    if (
      (await db.query("SELECT to_regclass('public.storage_deletions') AS t"))
        .rows[0].t
    ) {
      await db.query("TRUNCATE storage_deletions,upload_reservations");
      await db.query(
        "UPDATE jobs SET state='failed',error='Restored job; retry available',workflow_run_id=NULL,dispatch_token=NULL,locked_at=NULL WHERE state IN ('queued','processing')",
      );
    }
    await db.query("COMMIT");
    console.log("Restore complete. Original transcript hashes verified.");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
} finally {
  await db.end();
}
