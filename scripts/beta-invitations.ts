import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import pg from "pg";
import { BETA_SEATS, betaEnabled } from "../lib/beta-config";

const output = process.argv[2];
const connectionString = process.env.DIRECT_DATABASE_URL;
if (!output || !connectionString || !process.env.APP_URL || !betaEnabled())
  throw new Error(
    "Set BETA_MODE=true, DIRECT_DATABASE_URL, and APP_URL, then pass a new private output path.",
  );
const origin = new URL(process.env.APP_URL);
if (origin.protocol !== "https:")
  throw new Error("Use the hosted beta HTTPS URL.");
const db = new pg.Client({ connectionString });
await db.connect();
try {
  await db.query("BEGIN");
  await db.query("LOCK TABLE beta_invitations IN EXCLUSIVE MODE");
  const slots = await db.query("SELECT slot FROM beta_invitations");
  const occupied = new Set(slots.rows.map(({ slot }) => slot));
  const links: string[] = [];
  for (let slot = 1; slot <= BETA_SEATS; slot++) {
    if (occupied.has(slot)) continue;
    const token = randomBytes(32).toString("base64url");
    await db.query(
      "INSERT INTO beta_invitations(slot,token_hash) VALUES($1,$2)",
      [slot, createHash("sha256").update(token).digest("hex")],
    );
    links.push(origin.origin + "/#invite=" + token);
  }
  if (links.length === 0)
    throw new Error("All ten invitation slots have already been issued.");
  await writeFile(output, links.join("\n") + "\n", { flag: "wx", mode: 0o600 });
  await db.query("COMMIT");
  console.log(
    `Saved ${links.length} invitation links to the private output file.`,
  );
} catch (error) {
  await db.query("ROLLBACK");
  throw error;
} finally {
  await db.end();
}
