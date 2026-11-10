import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";
const connectionString =
  process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString)
  throw new Error("Set DIRECT_DATABASE_URL for migrations");
if (
  process.env.DEPLOY_ENV === "preview" &&
  connectionString === process.env.PRODUCTION_DATABASE_URL
)
  throw new Error("Preview cannot migrate the production database");
const db = new pg.Client({ connectionString });
await db.connect();
try {
  await db.query("SELECT pg_advisory_lock(822741930)");
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const [version, file] of [
    ["001", "schema.sql"],
    ["002", "hosting.sql"],
    ["003", "demo.sql"],
    ["004", "workflow.sql"],
    ["005", "groq.sql"],
    ["006", "bulk-discovery.sql"],
    ["007", "workflow-capacity.sql"],
    ["008", "groq-rate-limits.sql"],
    ["009", "analysis-warnings.sql"],
    ["010", "gemini.sql"],
    ["011", "research.sql"],
    ["012", "discovery-experience.sql"],
    ["013", "commercial.sql"],
    ["014", "commercial-review.sql"],
    ["015", "commercial-concurrency.sql"],
    ["016", "account-deletion.sql"],
  ]) {
    const sql = await readFile(
      new URL("../lib/" + file, import.meta.url),
      "utf8",
    );
    const checksum = createHash("sha256").update(sql).digest("hex");
    const { rows } = await db.query(
      "SELECT checksum FROM schema_migrations WHERE version=$1",
      [version],
    );
    if (rows.length) {
      if (rows[0].checksum !== checksum)
        throw new Error("Applied migration changed: " + version);
      continue;
    }
    await db.query("BEGIN");
    try {
      await db.query(sql);
      await db.query(
        "INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)",
        [version, checksum],
      );
      await db.query("COMMIT");
      console.log("Applied migration", version);
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await db.query("SELECT pg_advisory_unlock(822741930)");
  await db.end();
}
