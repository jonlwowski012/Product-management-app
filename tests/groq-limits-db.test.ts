import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

test("Groq budgets serialize concurrent workers, survive rollbacks, and honor provider cooldowns", async () => {
  const name = "groq_limits_" + randomUUID().replaceAll("-", "") + "_e2e";
  const url = new URL(process.env.DATABASE_URL!);
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  url.pathname = "/" + name;
  process.env.DATABASE_URL = url.toString();
  const db = new pg.Client({ connectionString: url.toString() });
  const { reserveGroq, observeGroq, GroqRateWait } =
    await import("../lib/groq-limits");
  try {
    await db.connect();
    await db.query(
      "CREATE TABLE settings(provider text DEFAULT 'openai', model text DEFAULT 'gpt-4.1-mini',openai_key text,anthropic_key text,groq_key text)",
    );
    await db.query("INSERT INTO settings DEFAULT VALUES");
    await db.query(
      "INSERT INTO settings(openai_key) VALUES('encrypted-fixture')",
    );
    await db.query(
      await readFile(
        new URL("../lib/groq-rate-limits.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.query("INSERT INTO settings DEFAULT VALUES");
    const { rows: defaults } = await db.query(
      "SELECT provider,model FROM settings",
    );
    assert.equal(
      defaults.filter(
        (r) => r.provider === "groq" && r.model === "openai/gpt-oss-20b",
      ).length,
      2,
    );
    assert.equal(defaults.filter((r) => r.provider === "openai").length, 1);
    const key = "fixture-" + randomUUID(),
      model = "openai/gpt-oss-20b";
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        reserveGroq(key, model, "x".repeat(9000)),
      ),
    );
    const accepted = results.filter((r) => r.status === "fulfilled");
    assert.equal(accepted.length, 1);
    for (const result of results)
      if (result.status === "rejected") {
        assert.ok(result.reason instanceof GroqRateWait);
        assert.ok(result.reason.seconds > 0 && result.reason.seconds <= 60);
      }
    const reservation = (accepted[0] as PromiseFulfilledResult<string>).value;
    await db.query("BEGIN");
    await db.query("SELECT 1");
    await db.query("ROLLBACK");
    await assert.rejects(() => reserveGroq(key, model, {}), GroqRateWait);
    await reserveGroq("another-fixture-key", model, {});
    await reserveGroq(key, "another-model", {});
    await observeGroq(key, model, reservation, new Response("{}"), {
      total_tokens: 100,
    });
    const second = await reserveGroq(key, model, {});
    await observeGroq(
      key,
      model,
      second,
      new Response("{}", { status: 429, headers: { "retry-after": "120" } }),
    );
    await assert.rejects(
      () => reserveGroq(key, model, {}),
      (error: unknown) => error instanceof GroqRateWait && error.seconds >= 119,
    );
    const remoteKey = "remote-budget-fixture";
    const third = await reserveGroq(remoteKey, model, {});
    await observeGroq(
      remoteKey,
      model,
      third,
      new Response("{}", {
        headers: {
          "x-ratelimit-remaining-tokens": "0",
          "x-ratelimit-reset-tokens": "2m30s",
        },
      }),
      { total_tokens: 100 },
    );
    await assert.rejects(
      () => reserveGroq(remoteKey, model, {}),
      (error: unknown) => error instanceof GroqRateWait && error.seconds >= 149,
    );
    await db.query(
      "CREATE TABLE jobs(id uuid PRIMARY KEY,state text,attempts integer,error text, available_at timestamptz,locked_at timestamptz,finished_at timestamptz)",
    );
    const job = randomUUID();
    await db.query(
      "INSERT INTO jobs(id,state,attempts) VALUES($1,'processing',3)",
      [job],
    );
    const { recordFailure } = await import("../lib/job-engine");
    await recordFailure(job, new GroqRateWait(120), true);
    const {
      rows: [deferred],
    } = await db.query(
      "SELECT state,attempts,finished_at,extract(epoch FROM (available_at-now())) AS delay FROM jobs WHERE id=$1",
      [job],
    );
    assert.equal(deferred.state, "queued");
    assert.equal(deferred.attempts, 2);
    assert.equal(deferred.finished_at, null);
    assert.ok(Number(deferred.delay) >= 119);
    const { rows } = await db.query("SELECT * FROM groq_rate_limits");
    assert.ok(!JSON.stringify(rows).includes(key));
    assert.ok(!JSON.stringify(rows).includes("xxxx"));
  } finally {
    await (
      globalThis as unknown as { groqRatePool: pg.Pool }
    ).groqRatePool.end();
    const appPool = (globalThis as unknown as { discoveryPool?: pg.Pool })
      .discoveryPool;
    if (appPool) await appPool.end();
    await db.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
});
