import "dotenv/config";
import pg from "pg";
import { z } from "zod";
import { approveBetaEmail } from "../lib/beta-approval";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254))
  .parse(process.argv[2]);
const connectionString = process.env.DIRECT_DATABASE_URL;
if (!connectionString)
  throw new Error("Set DIRECT_DATABASE_URL to the target beta database.");
const db = new pg.Client({ connectionString });
await db.connect();
try {
  await db.query("BEGIN");
  const result = await approveBetaEmail(db, email);
  if (result === "full") throw new Error("All beta slots are in use.");
  await db.query("COMMIT");
  console.log(
    result === "added"
      ? "Email approved for the beta."
      : "Email is already approved.",
  );
} catch (error) {
  await db.query("ROLLBACK");
  throw error;
} finally {
  await db.end();
}
