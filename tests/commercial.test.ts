import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";
import { randomUUID, createHmac } from "node:crypto";
import { mkdtemp, mkdir, writeFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
test("commercial boundaries enforce payment, capacity, customer keys, signatures, and deletion", async () => {
  const previous = { ...process.env };
  const base = new URL(process.env.DATABASE_URL!);
  const adminUrl = new URL(base);
  adminUrl.pathname = "/postgres";
  const name = "commercial_" + randomUUID().replaceAll("-", "") + "_e2e";
  base.pathname = "/" + name;
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  const db = new pg.Client({ connectionString: base.toString() });
  let pool: typeof import("../lib/db").pool | undefined;
  await db.connect();
  try {
    const migration = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/migrate.ts"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: base.toString(),
          DIRECT_DATABASE_URL: base.toString(),
        },
      },
    );
    assert.equal(migration.status, 0, migration.stderr);
    process.env.DATABASE_URL = base.toString();
    const { paidAccess, MONTHLY_PRICE_CENTS } = await import("../lib/billing");
    const now = Date.now();
    assert.equal(MONTHLY_PRICE_CENTS, 1000);
    assert.equal(paidAccess(null, false, now), false);
    assert.equal(paidAccess(new Date(now), false, now), false);
    assert.equal(paidAccess(new Date(now + 1), false, now), true);
    assert.equal(paidAccess(new Date(now + 1), true, now), false);
    const { assertWritableUser, pool: appPool } = await import("../lib/db");
    pool = appPool;
    const { paidAccount } = await import("./fixtures/paid-account");
    const { credentials, generate } = await import("../lib/ai");
    const { deleteAccount, changePassword, accountRateLimit } =
      await import("../lib/accounts");
    const { z } = await import("zod");
    const user = randomUUID(),
      other = randomUUID();
    await db.query(
      "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,'Owner','fixture'),($3,$4,'Other','fixture')",
      [user, user + "@example.com", other, other + "@example.com"],
    );
    await assert.rejects(
      () => assertWritableUser(user),
      (error: any) => error.status === 402,
    );
    await db.query(
      "INSERT INTO subscriptions(user_id,status) VALUES($1,'unpaid')",
      [other],
    );
    process.env.CRON_SECRET = "commercial-health-secret";
    const { GET: maintenance } = await import("../app/api/maintenance/route");
    const healthRequest = () =>
      new Request("http://localhost/api/maintenance", {
        headers: { authorization: "Bearer commercial-health-secret" },
      });
    assert.equal(
      (await (await maintenance(healthRequest())).json()).health
        .pastDueAccounts,
      0,
      "Abandoned checkouts are not delinquent subscriptions",
    );
    await db.query(
      "UPDATE subscriptions SET status='past_due',subscription_id='sub_fixture',paid_until=now()-interval '1 day' WHERE user_id=$1",
      [other],
    );
    assert.equal(
      (await (await maintenance(healthRequest())).json()).health
        .pastDueAccounts,
      1,
    );
    const waitingJob = randomUUID();
    await db.query(
      "INSERT INTO jobs(id,user_id,purpose,provider,model,state,locked_at,available_at,dispatch_after) VALUES($1,$2,'extract','groq','test','processing',now()-interval '2 hours',now()+interval '1 day',now()+interval '1 day')",
      [waitingJob, other],
    );
    assert.equal(
      (await (await maintenance(healthRequest())).json()).health.stuckJobs,
      0,
      "A scheduled provider wait is not stuck work",
    );
    await db.query(
      "UPDATE jobs SET available_at=now()-interval '1 second' WHERE id=$1",
      [waitingJob],
    );
    assert.equal(
      (await (await maintenance(healthRequest())).json()).health.stuckJobs,
      1,
      "An overdue job without progress must still alert",
    );
    await db.query("UPDATE jobs SET state='failed' WHERE id=$1", [waitingJob]);
    await paidAccount(db, user);
    await assertWritableUser(user);
    const { hashPassword, checkPassword, newSession } =
      await import("../lib/auth");
    const attempts = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        accountRateLimit("concurrent-auth-test", 10),
      ),
    );
    assert.equal(
      attempts.filter((r) => r.status === "fulfilled").length,
      10,
      "Parallel authentication attempts cannot bypass the account rate limit",
    );
    const initialHash = hashPassword("previous-password");
    await db.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
      user,
      initialHash,
    ]);
    const changes = await Promise.allSettled([
      changePassword(user, "previous-password", "first-new-password"),
      changePassword(user, "previous-password", "second-new-password"),
    ]);
    assert.equal(
      changes.filter((r) => r.status === "fulfilled").length,
      1,
      "Concurrent password changes cannot both use an obsolete password",
    );
    const stored = (
      await db.query("SELECT password_hash FROM users WHERE id=$1", [user])
    ).rows[0].password_hash;
    assert.ok(
      checkPassword(
        changes[0].status === "fulfilled"
          ? "first-new-password"
          : "second-new-password",
        stored,
      ),
    );
    await assert.rejects(
      () => newSession(user, false, initialHash),
      (e: any) => e.status === 401,
      "An in-flight login with the old hash cannot recreate a revoked session",
    );
    const { cleanStorage, scheduleDeletion } = await import("../lib/storage");
    const folder = await mkdtemp(path.join(tmpdir(), "cleanup-review-"));
    try {
      for (let i = 0; i < 50; i++) {
        const directory = path.join(folder, String(i));
        await mkdir(directory);
        await scheduleDeletion(directory);
      }
      const file = path.join(folder, "later-original");
      await writeFile(file, "bytes");
      await scheduleDeletion(file);
      await cleanStorage();
      await cleanStorage();
      await assert.rejects(
        () => access(file),
        "Failed file deletions must not starve later originals",
      );
    } finally {
      await db.query("DELETE FROM storage_deletions WHERE pathname LIKE $1", [
        folder + "/%",
      ]);
      await rm(folder, { recursive: true, force: true });
    }
    const { discoverySource } = await import("../lib/reports");
    process.env.VERCEL = "1";
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN,
      storeId = process.env.BLOB_STORE_ID;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_STORE_ID;
    try {
      await assert.rejects(
        () =>
          discoverySource(
            user,
            "missing-store.txt",
            Buffer.from("An original that must be saved"),
          ),
        (e: any) => e.status === 503,
      );
    } finally {
      if (blobToken) process.env.BLOB_READ_WRITE_TOKEN = blobToken;
      if (storeId) process.env.BLOB_STORE_ID = storeId;
      delete process.env.VERCEL;
    }
    assert.ok(
      (await credentials(user, "openai")).startsWith("test-provider-key-"),
    );
    await db.query("UPDATE settings SET openai_key=NULL WHERE user_id=$1", [
      user,
    ]);
    process.env.INCLUDED_AI_API_KEY = "must-never-be-used";
    await assert.rejects(
      () =>
        generate(
          user,
          "openai",
          "test",
          "system",
          "input",
          z.object({}),
          "test",
        ),
      /Connect your/,
    );
    const first = randomUUID();
    await db.query(
      "INSERT INTO jobs(id,user_id,purpose,provider,model,state) VALUES($1,$2,'extract','openai','test','queued')",
      [first, user],
    );
    await assert.rejects(
      () =>
        db.query(
          "INSERT INTO jobs(id,user_id,purpose,provider,model) VALUES($1,$2,'extract','openai','test')",
          [randomUUID(), user],
        ),
      /One analysis/,
    );
    await db.query("UPDATE jobs SET state='failed' WHERE id=$1", [first]);
    const competing = randomUUID();
    await db.query(
      "INSERT INTO jobs(id,user_id,purpose,provider,model) VALUES($1,$2,'extract','openai','test')",
      [competing, user],
    );
    await assert.rejects(
      () => db.query("UPDATE jobs SET state='queued' WHERE id=$1", [first]),
      /One analysis/,
    );
    await db.query("UPDATE jobs SET state='failed' WHERE id=$1", [competing]);
    const { recordFailure } = await import("../lib/job-engine");
    const oldAttempt = randomUUID(),
      newAttempt = randomUUID();
    await db.query(
      "UPDATE jobs SET state='processing',dispatch_token=$2 WHERE id=$1",
      [first, oldAttempt],
    );
    await recordFailure(
      first,
      new Error("Old step stopped"),
      false,
      oldAttempt,
    );
    await db.query(
      "UPDATE jobs SET state='processing',dispatch_token=$2 WHERE id=$1",
      [first, newAttempt],
    );
    await recordFailure(
      first,
      new Error("Delayed old workflow finalizer"),
      false,
      oldAttempt,
    );
    assert.equal(
      (await db.query("SELECT state FROM jobs WHERE id=$1", [first])).rows[0]
        .state,
      "processing",
      "An old finalizer cannot fail a replacement attempt",
    );
    await recordFailure(
      first,
      new Error("Current run stopped"),
      false,
      newAttempt,
    );
    assert.equal(
      (await db.query("SELECT state FROM jobs WHERE id=$1", [first])).rows[0]
        .state,
      "failed",
    );

    await db.query(
      "INSERT INTO discovery_sources(id,user_id,filename,sha256,pages,storage_path,original_bytes) VALUES($1,$2,'original.txt','one','[]','/private/tmp/commercial-original',1073741824)",
      [randomUUID(), user],
    );
    await assert.rejects(
      () =>
        db.query(
          "INSERT INTO discovery_sources(id,user_id,filename,sha256,pages,original_bytes) VALUES($1,$2,'extra.txt','two','[]',1)",
          [randomUUID(), user],
        ),
      /Workspace storage limit/,
    );
    await db.query(
      "UPDATE subscriptions SET paid_until=now()-interval '1 second' WHERE user_id=$1",
      [user],
    );
    await assert.rejects(
      () => assertWritableUser(user),
      (error: any) => error.status === 402,
    );
    process.env.STRIPE_SECRET_KEY = "sk_test_signature_only";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_signature_only";
    const { POST } = await import("../app/api/billing/webhook/route");
    const rejected = await POST(
      new Request("http://localhost/api/billing/webhook", {
        method: "POST",
        body: "{}",
        headers: { "stripe-signature": "invalid" },
      }),
    );
    assert.equal(rejected.status, 400);
    const Stripe = (await import("stripe")).default;
    const payload = JSON.stringify({
      id: "evt_test",
      object: "event",
      type: "irrelevant.event",
      data: { object: {} },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await POST(
            new Request("http://localhost/api/billing/webhook", {
              method: "POST",
              body: payload,
              headers: { "stripe-signature": signature },
            }),
          )
        ).status,
        200,
      );
    await db.query("INSERT INTO auth_attempts(identity) VALUES($1)", [
      user + "@example.com",
    ]);
    const upload = randomUUID();
    const incoming = `incoming/${user}/${upload}/late.txt`;
    await db.query(
      "INSERT INTO upload_reservations(id,user_id,filename,title,pathname,expected_size,discovery) VALUES($1,$2,'late.txt','Late upload',$3,10,true)",
      [upload, user, incoming],
    );
    await db.query("UPDATE users SET deletion_requested_at=now() WHERE id=$1", [
      user,
    ]);
    await assert.rejects(
      () =>
        db.query("UPDATE settings SET openai_key='late-key' WHERE user_id=$1", [
          user,
        ]),
      /Account deletion is in progress/,
    );
    await assert.rejects(
      () =>
        db.query(
          "INSERT INTO discovery_sources(id,user_id,filename,sha256,pages) VALUES($1,$2,'late.txt','late','[]')",
          [randomUUID(), user],
        ),
      /Account deletion is in progress/,
    );
    await assert.rejects(
      () => db.query("UPDATE jobs SET state='queued' WHERE id=$1", [first]),
      /Account deletion is in progress/,
    );
    await deleteAccount(user);
    const {
      rows: [cleanup],
    } = await db.query(
      "SELECT not_before>now()+interval '1 hour' AS deferred FROM storage_deletions WHERE pathname=$1",
      ["blob:" + incoming],
    );
    assert.equal(
      cleanup.deferred,
      true,
      "Previously issued upload tokens must expire before final cleanup",
    );
    await db.query("DELETE FROM storage_deletions WHERE pathname=$1", [
      "blob:" + incoming,
    ]);
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_e2estore_test-secret";
    const callbackBody = JSON.stringify({
      type: "blob.upload-completed",
      payload: {
        blob: { pathname: incoming, url: "https://example.invalid/late.txt" },
        tokenPayload: upload,
      },
    });
    const callbackSignature = createHmac(
      "sha256",
      process.env.BLOB_READ_WRITE_TOKEN,
    )
      .update(callbackBody)
      .digest("hex");
    const { POST: uploadCallback } =
      await import("../app/api/uploads/token/route");
    const late = await uploadCallback(
      new Request("http://localhost/api/uploads/token", {
        method: "POST",
        body: callbackBody,
        headers: {
          "Content-Type": "application/json",
          "x-vercel-signature": callbackSignature,
        },
      }),
    );
    assert.equal(late.status, 200, await late.text());
    assert.equal(
      (
        await db.query(
          "SELECT pathname FROM storage_deletions WHERE pathname=$1",
          ["blob:" + incoming],
        )
      ).rowCount,
      1,
      "A signed late callback must restore the cleanup intent",
    );
    assert.equal(
      (
        await db.query("SELECT identity FROM auth_attempts WHERE identity=$1", [
          user + "@example.com",
        ])
      ).rowCount,
      0,
    );
    assert.equal(
      (await db.query("SELECT id FROM users WHERE id=$1", [user])).rowCount,
      0,
    );
    assert.equal(
      (await db.query("SELECT id FROM users WHERE id=$1", [other])).rowCount,
      1,
    );
    assert.equal(
      (
        await db.query(
          "SELECT pathname FROM storage_deletions WHERE pathname='/private/tmp/commercial-original'",
        )
      ).rowCount,
      1,
    );
  } finally {
    await pool?.end();
    process.env = previous;
    await db.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
});
