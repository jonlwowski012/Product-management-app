import { paidAccount } from "./fixtures/paid-account";
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mockProvider } from "../scripts/mock-provider.mjs";

test("partial report recovery preserves the readable snapshot and successful checkpoints", async () => {
  const name = "discovery_" + randomUUID().replaceAll("-", "") + "_e2e";
  const url = new URL(process.env.DATABASE_URL!);
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  url.pathname = "/" + name;
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const previousEnv = { ...process.env };
  let server: Awaited<ReturnType<typeof mockProvider>> | undefined;
  try {
    const migrated = spawnSync(
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
    assert.equal(migrated.status, 0, migrated.stderr);
    server = await mockProvider(0);
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    Object.assign(process.env, {
      DATABASE_URL: url.toString(),
      INCLUDED_AI_API_KEY: "discovery-test-key",
      INCLUDED_AI_PROVIDER: "openai",
      INCLUDED_AI_MODEL: "mock-source-errors",
      E2E_TEST_MODE: "1",
      NODE_ENV: "test",
      JOB_RUNNER: "local",
      E2E_PROVIDER_BASE_URL: `http://127.0.0.1:${address.port}`,
    });
    delete process.env.SITE_ID;
    const { discoverySource, createReport, reportDetail } =
      await import("../lib/reports");
    const { reportApi } = await import("../lib/report-api");
    const { runOne } = await import("../lib/jobs");
    const user = randomUUID();
    await db.query(
      "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,'Test','fixture')",
      [user, user + "@example.com"],
    );
    await paidAccount(db, user, "mock-source-errors");
    const sources = [];
    for (const filename of ["Failed interview.txt", "Good interview.txt"])
      sources.push(
        await discoverySource(
          user,
          filename,
          Buffer.from(filename + "\nWe need audit logs before we can buy."),
        ),
      );
    const created = await createReport(user, {
      sources: sources.map((s) => ({ id: s.id, role: "customer" })),
    });
    const finish = async (reportId = created.id) => {
      for (let i = 0; i < 12; i++) {
        await db.query(
          "UPDATE jobs SET available_at=now() WHERE report_id=$1",
          [reportId],
        );
        await runOne();
        const detail = await reportDetail(user, reportId);
        if (["succeeded", "failed"].includes(detail.job.state)) return detail;
      }
      throw new Error("Analysis did not finish");
    };
    const partial = await finish();
    assert.equal(partial.job.state, "succeeded");
    assert.equal(partial.result.coverage.analyzed_sources, 1);
    const { rows: before } = await db.query(
      "SELECT * FROM job_chunks WHERE job_id=$1 AND warning IS NULL",
      [partial.job.id],
    );
    const usageBefore = (
      await db.query(
        "SELECT runs,characters FROM included_usage WHERE user_id=$1",
        [user],
      )
    ).rows;
    const call = (parts: string[], input = {}, method = "POST", actor = user) =>
      reportApi(
        { method } as any,
        parts,
        actor,
        async () => input,
        async () => Buffer.alloc(0),
      );
    const oid = partial.result.opportunities[0].id;
    const chosen = (await call(
      ["reports", created.id, "validation", oid],
      {
        version: 0,
        status: "chosen",
        activity: "Interview the owner",
        learning: "",
        outcome: null,
      },
      "PATCH",
    )) as any;
    assert.equal(chosen.version, 1);
    await assert.rejects(
      () =>
        call(
          ["reports", created.id, "validation", oid],
          {
            version: 0,
            status: "testing",
            activity: "Overwrite",
            learning: "",
            outcome: null,
          },
          "PATCH",
        ),
      /changed/,
    );
    await call(
      ["reports", created.id, "edit"],
      {
        version: partial.version,
        index: 0,
        title: "Reviewed title",
        problem: "Reviewed problem",
        uncertainty: "Still uncertain",
        next_step: "Reviewed next step",
      },
      "PATCH",
    );
    const preserved = await reportDetail(user, created.id);
    const recoveries = (await Promise.all([
      call(["reports", created.id, "retry-omitted"]),
      call(["reports", created.id, "retry-omitted"]),
    ])) as any[];
    const recovery = recoveries[0];
    assert.equal(recoveries[1].id, recovery.id);
    const running = await reportDetail(user, recovery.id);
    assert.deepEqual(
      (await reportDetail(user, created.id)).result,
      preserved.result,
    );
    assert.equal(running.result, null);
    assert.equal(running.job.state, "queued");
    assert.equal(
      ((await call(["reports", created.id, "retry-omitted"])) as any).id,
      recovery.id,
    );
    const checkpoints = (
      await db.query(
        "SELECT * FROM job_chunks WHERE job_id=$1 AND completed AND warning IS NULL",
        [running.job.id],
      )
    ).rows;
    assert.deepEqual(
      checkpoints.map(({ job_id, ...c }) => c),
      before.map(({ job_id, ...c }) => c),
    );
    const recovered = await finish(recovery.id);
    assert.equal(recovered.job.state, "succeeded");
    assert.equal(recovered.result.coverage.analyzed_sources, 2);
    assert.equal(recovered.analysis_warnings.length, 0);
    assert.deepEqual(
      (
        await db.query(
          "SELECT runs,characters FROM included_usage WHERE user_id=$1",
          [user],
        )
      ).rows,
      usageBefore,
    );
    assert.deepEqual(
      (
        await db.query(
          "SELECT * FROM job_chunks WHERE job_id=$1 AND chunk_index=$2",
          [partial.job.id, before[0].chunk_index],
        )
      ).rows,
      before,
    );
    assert.equal(
      ((await call(["reports", created.id, "retry-omitted"])) as any).id,
      recovery.id,
    );
    assert.equal(recovered.validation_work[0].opportunity_id, oid);
    assert.equal(recovered.validation_work[0].activity, "Interview the owner");
    assert.notEqual(recovered.result.opportunities[0].id, oid);
    assert.equal(
      (await reportDetail(user, created.id)).result.opportunities[0].title,
      "Reviewed title",
    );
    await assert.rejects(
      () =>
        call(
          ["reports", recovery.id, "validation", oid],
          {
            version: 0,
            status: "chosen",
            activity: "",
            learning: "",
            outcome: null,
          },
          "PATCH",
        ),
      /not found/,
    );
    await assert.rejects(
      () =>
        call(
          ["reports", created.id, "validation", oid],
          {
            version: 1,
            status: "reviewed",
            activity: "Interview",
            learning: "",
            outcome: "supported",
          },
          "PATCH",
        ),
      /Record what/,
    );
    const reviewed = (await call(
      ["reports", created.id, "validation", oid],
      {
        version: 1,
        status: "reviewed",
        activity: "Interview",
        learning: "The owner confirmed the gap, but retention is unclear.",
        outcome: "inconclusive",
      },
      "PATCH",
    )) as any;
    assert.equal(reviewed.version, 2);
    await assert.rejects(
      () => reportDetail(randomUUID(), created.id),
      /not found/,
    );
    await assert.rejects(
      () =>
        call(
          ["reports", created.id, "validation", oid],
          {
            version: 2,
            status: "testing",
            activity: "",
            learning: "",
            outcome: null,
          },
          "PATCH",
          randomUUID(),
        ),
      /not found|read only/,
    );
    await db.query(
      "UPDATE settings SET model='mock-source-errors-always' WHERE user_id=$1",
      [user],
    );
    const persistent = await createReport(user, {
      question: "Persistent failure",
      sources: sources.map((s) => ({ id: s.id, role: "customer" })),
    });
    let stillPartial = await finish(persistent.id);
    assert.equal(stillPartial.analysis_status, "partial");
    for (let attempt = 0; attempt < 3; attempt++) {
      const next = (await call([
        "reports",
        stillPartial.id,
        "retry-omitted",
      ])) as any;
      stillPartial = await finish(next.id);
      assert.equal(stillPartial.analysis_status, "partial");
      assert.equal(stillPartial.recovery_attempts, attempt + 1);
    }
    assert.equal(stillPartial.can_recover, false);
    await assert.rejects(
      () => call(["reports", stillPartial.id, "retry-omitted"]),
      /Recovery limit reached/,
    );
  } finally {
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    await (
      globalThis as unknown as { discoveryPool?: pg.Pool }
    ).discoveryPool?.end();
    process.env = previousEnv;
    await db.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
});
