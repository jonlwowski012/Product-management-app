import "dotenv/config";
import pg from "pg";
import { get } from "@vercel/blob";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
const target = process.argv[2];
if (!target || !process.env.DATABASE_URL)
  throw new Error(
    "Usage: npm run backup -- /new/backup/directory; set DATABASE_URL",
  );
const url = new URL(process.env.DATABASE_URL);
const connectionEnv = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  ...(url.searchParams.has("sslmode")
    ? { PGSSLMODE: url.searchParams.get("sslmode") }
    : {}),
};
const dir = path.resolve(target);
await mkdir(dir, { mode: 0o700 });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  const hasSources = (
    await db.query("SELECT to_regclass('public.discovery_sources') AS t")
  ).rows[0].t;
  // Keep originals referenced until both the shared SQL snapshot and their bytes are captured.
  const sources = hasSources
    ? (
        await db.query(
          "SELECT * FROM discovery_sources ORDER BY id FOR KEY SHARE",
        )
      ).rows
    : [];
  const {
    rows: [snapshot],
  } = await db.query("SELECT pg_export_snapshot() AS id");
  await new Promise((resolve, reject) => {
    const child = spawn(
      "pg_dump",
      [
        "--snapshot=" + snapshot.id,
        "--no-owner",
        "--no-acl",
        "--inserts",
        "--rows-per-insert=100",
        "--file",
        path.join(dir, "database.sql"),
      ],
      {
        env: connectionEnv,
        stdio: ["ignore", "inherit", "inherit"],
      },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("pg_dump failed")),
    );
  });
  if (hasSources) {
    await mkdir(path.join(dir, "sources"), { mode: 0o700 });
    for (const source of sources) {
      let bytes;
      if (source.storage_path?.startsWith("blob:")) {
        const blob = await get(source.storage_path.slice(5), {
          access: "private",
          useCache: false,
        });
        if (!blob || blob.statusCode !== 200)
          throw new Error("Source original unavailable during backup");
        bytes = Buffer.from(await new Response(blob.stream).arrayBuffer());
      } else if (source.storage_path)
        bytes = await readFile(source.storage_path);
      else bytes = Buffer.from(source.pages.map((p) => p.text).join("\n"));
      if (
        createHash("sha256").update(bytes.toString("base64")).digest("hex") !==
        source.sha256
      )
        throw new Error("Source original integrity check failed during backup");
      await writeFile(path.join(dir, "sources", source.id), bytes, {
        mode: 0o600,
      });
    }
  }
  await writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify(
      {
        format: 1,
        created_at: new Date().toISOString(),
        source:
          "PostgreSQL snapshot; originals reconstructed from raw_text at restore",
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  await db.query("COMMIT");
  console.log("Backup complete:", dir);
} catch (error) {
  await db.query("ROLLBACK");
  throw error;
} finally {
  await db.end();
}
