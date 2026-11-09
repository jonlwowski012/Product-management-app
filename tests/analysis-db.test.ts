import { paidAccount } from "./fixtures/paid-account";
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mockProvider } from "../scripts/mock-provider.mjs";

test("local worker continues after multiple Groq document failures without exhausting the job retry budget", async () => {
  const name = "analysis_" + randomUUID().replaceAll("-", "") + "_e2e";
  const url = new URL(process.env.DATABASE_URL!);
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  url.pathname = "/" + name;
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const oldEnv = { ...process.env };
  let server: Awaited<ReturnType<typeof mockProvider>> | undefined;
  try {
    const migration = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/migrate.ts"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: url.toString(),
          DIRECT_DATABASE_URL: url.toString(),
        },
      },
    );
    assert.equal(migration.status, 0, migration.stderr);
    server = await mockProvider(0, async () => {
      // Advance only this fixture's quota clock so the test does not wait real minutes.
      await db.query(
        "UPDATE groq_rate_limits SET state=jsonb_set(state,'{events}','[]'::jsonb)",
      );
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    Object.assign(process.env, {
      DATABASE_URL: url.toString(),
      INCLUDED_AI_API_KEY: "local-worker-fixture",
      E2E_TEST_MODE: "1",
      NODE_ENV: "test",
      E2E_PROVIDER_BASE_URL: `http://127.0.0.1:${address.port}`,
    });
    const { runOne } = await import("../lib/jobs");
    const { REPORT_VERSION } = await import("../lib/reports");
    const user = randomUUID(),
      report = randomUUID(),
      job = randomUUID();
    await db.query(
      "INSERT INTO users(id,email,name,password_hash) VALUES($1,'worker@example.com','Worker','fixture')",
      [user],
    );
    await paidAccount(db, user, "mock-source-errors", "groq");
    await db.query(
      "INSERT INTO discovery_reports(id,user_id,input_hash) VALUES($1,$2,'fixture')",
      [report, user],
    );
    const sources = [
      "Failed first.txt",
      "Failed second.txt",
      "Good interview.txt",
    ];
    for (const [index, filename] of sources.entries()) {
      const sid = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
      await db.query(
        "INSERT INTO discovery_sources(id,user_id,filename,sha256,pages) VALUES($1,$2,$3,$3,$4)",
        [
          sid,
          user,
          filename,
          JSON.stringify([
            {
              label: "Original text",
              text: "We need audit logs before we can buy.",
            },
          ]),
        ],
      );
      await db.query(
        "INSERT INTO discovery_report_sources(user_id,report_id,source_id,role) VALUES($1,$2,$3,'customer')",
        [user, report, sid],
      );
    }
    await db.query(
      "INSERT INTO jobs(id,user_id,report_id,purpose,provider,model,prompt_version,billing_mode,source_hash) VALUES($1,$2,$3,'analyze','groq','mock-source-errors',$4,'byok','fixture')",
      [job, user, report, REPORT_VERSION],
    );
    for (let iteration = 0; iteration < 8; iteration++) {
      await runOne();
      const {
        rows: [status],
      } = await db.query("SELECT state,error FROM jobs WHERE id=$1", [job]);
      assert.notEqual(status.state, "failed", status.error);
      if (status.state === "succeeded") break;
      await db.query("UPDATE jobs SET available_at=now() WHERE id=$1", [job]);
    }
    const {
      rows: [finished],
    } = await db.query("SELECT state,attempts FROM jobs WHERE id=$1", [job]);
    assert.equal(finished.state, "succeeded");
    assert.equal(finished.attempts, 1);
    const { rows: chunks } = await db.query(
      "SELECT * FROM job_chunks WHERE job_id=$1 ORDER BY chunk_index",
      [job],
    );
    assert.deepEqual(
      chunks.map((c) => c.attempts),
      [3, 3, 0],
    );
    assert.ok(chunks.every((c) => c.completed));
    assert.match(chunks[0].warning, /structured response/);
    assert.match(chunks[1].warning, /structured response/);
    assert.equal(chunks[2].warning, null);
    const {
      rows: [saved],
    } = await db.query("SELECT result FROM discovery_reports WHERE id=$1", [
      report,
    ]);
    assert.equal(saved.result.analysis_warnings.length, 2);
    assert.equal(saved.result.coverage.analyzed_sources, 1);
    assert.equal(saved.result.findings.length, 1);
    assert.ok(!JSON.stringify(saved).includes("Private source text"));

    const { reportDetail } = await import("../lib/reports");
    const { reportApi } = await import("../lib/report-api");
    process.env.JOB_RUNNER = "local";
    delete process.env.VERCEL;
    await db.query(
      "UPDATE jobs SET state='failed',attempts=3,error='A new provider error' WHERE id=$1",
      [job],
    );
    assert.equal((await reportDetail(user, report)).job.can_retry, false);
    const retry = () =>
      reportApi(
        { method: "POST" } as any,
        ["reports", report, "retry"],
        user,
        async () => ({}),
        async () => Buffer.alloc(0),
      );
    await assert.rejects(retry, /retry limit/);
    await db.query("UPDATE discovery_reports SET result=NULL WHERE id=$1", [
      report,
    ]);
    await db.query("UPDATE jobs SET error=$2 WHERE id=$1", [
      job,
      "Groq could not generate a valid structured response. Retry analysis; completed source batches are preserved.",
    ]);
    assert.equal((await reportDetail(user, report)).job.can_retry, true);
    await retry();
    const { rows: reopened } = await db.query(
      "SELECT completed,warning FROM job_chunks WHERE job_id=$1 ORDER BY chunk_index",
      [job],
    );
    assert.deepEqual(
      reopened.map((c) => c.completed),
      [false, false, true],
    );
    assert.ok(reopened.every((c) => c.warning === null));
    await runOne();
    const recovered = await reportDetail(user, report);
    assert.equal(recovered.job.state, "succeeded");
    assert.equal(recovered.result.findings.length, 3);
    assert.equal(recovered.result.coverage.analyzed_sources, 3);
    assert.equal(recovered.analysis_warnings.length, 0);
  } finally {
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    const globals = globalThis as unknown as {
      groqRatePool?: pg.Pool;
      discoveryPool?: pg.Pool;
    };
    await globals.groqRatePool?.end();
    await globals.discoveryPool?.end();
    process.env = oldEnv;
    await db.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
});
