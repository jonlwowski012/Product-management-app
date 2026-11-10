import pg from "pg";
import { randomBytes } from "node:crypto";
import { seedDemoReport } from "./demo-report";
import { DEMO_USER_ID, DEMO_EMAIL, DEMO_VERSION } from "./demo-constants";

export async function seedDemo(
  connectionString = process.env.DIRECT_DATABASE_URL ??
    process.env.DATABASE_URL,
) {
  if (!connectionString)
    throw new Error("Set a database connection before seeding the demo");
  const db = new pg.Client({ connectionString });
  await db.connect();
  try {
    await db.query("SELECT pg_advisory_lock(822741931)");
    const { rows: identities } = await db.query(
      "SELECT id,is_demo FROM users WHERE id=$1 OR email=$2 OR is_demo",
      [DEMO_USER_ID, DEMO_EMAIL],
    );
    if (identities.some((u) => u.id !== DEMO_USER_ID || !u.is_demo))
      throw new Error(
        "Demo identity conflicts with an existing account; no records were changed",
      );
    const {
      rows: [existing],
    } = await db.query("SELECT version FROM demo_dataset WHERE user_id=$1", [
      DEMO_USER_ID,
    ]);
    if (existing?.version === DEMO_VERSION)
      return { version: DEMO_VERSION, changed: false };
    await db.query("BEGIN");
    try {
      await db.query("SET CONSTRAINTS ALL DEFERRED");
      const { rows: oldSources } = await db.query(
        "SELECT storage_path FROM transcripts WHERE user_id=$1 UNION SELECT storage_path FROM discovery_sources WHERE user_id=$1",
        [DEMO_USER_ID],
      );
      await db.query(
        "INSERT INTO users(id,email,name,password_hash,is_demo) VALUES($1,$2,'Simulation discovery demo',$3,true) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name",
        [DEMO_USER_ID, DEMO_EMAIL, randomBytes(64).toString("hex")],
      );
      for (const table of [
        "jobs",
        "discovery_reports",
        "discovery_sources",
        "stances",
        "curation",
        "audit",
        "questions",
        "assessments",
        "briefs",
        "features",
        "signals",
        "transcripts",
        "customers",
        "products",
      ])
        await db.query(`DELETE FROM ${table} WHERE user_id=$1`, [DEMO_USER_ID]);
      await db.query(
        "INSERT INTO settings(user_id,provider,model,validation_threshold) VALUES($1,'openai','prerecorded-example',3) ON CONFLICT(user_id) DO UPDATE SET provider='openai',model='prerecorded-example',validation_threshold=3,openai_key=NULL,anthropic_key=NULL,groq_key=NULL,gemini_key=NULL",
        [DEMO_USER_ID],
      );
      await seedDemoReport(db);
      await db.query(
        "INSERT INTO demo_dataset(user_id,version) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET version=EXCLUDED.version,seeded_at=now()",
        [DEMO_USER_ID, DEMO_VERSION],
      );
      for (const source of oldSources)
        if (source.storage_path)
          await db.query(
            "INSERT INTO storage_deletions(pathname,not_before) VALUES($1,now()) ON CONFLICT(pathname) DO UPDATE SET transcript_id=NULL,not_before=now()",
            [source.storage_path],
          );
      await db.query("COMMIT");
      return { version: DEMO_VERSION, changed: true };
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  } finally {
    await db.query("SELECT pg_advisory_unlock(822741931)");
    await db.end();
  }
}
