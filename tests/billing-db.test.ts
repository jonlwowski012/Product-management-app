import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";
import pg from "pg";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { paidAccount } from "./fixtures/paid-account";

test("checkout renewal and expiry preserve sessions, payments, and owner locking", async (t) => {
  const previous = { ...process.env };
  const url = new URL(process.env.DATABASE_URL!);
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const name = "billing_" + randomUUID().replaceAll("-", "") + "_e2e";
  url.pathname = "/" + name;
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  let pool: typeof import("../lib/db").pool | undefined;
  const user = randomUUID();
  const sessions = new Map<
    string,
    { id: string; status: string; url: string }
  >();
  const idempotency = new Map<string, string>();
  let subscriptions: any[] = [];
  let invoices: any[] = [];
  const actions: string[] = [];
  let pause: Promise<void> | undefined;
  let reached: (() => void) | undefined;
  const server = http.createServer(async (request, response) => {
    for await (const _ of request) {
      /* consume Stripe's request body */
    }
    const route = new URL(request.url!, "http://localhost");
    if (route.searchParams.get("customer")?.startsWith("cus_fail")) {
      response.writeHead(500, { "Stripe-Should-Retry": "false" });
      response.end(
        JSON.stringify({ error: { message: "Temporary fixture failure" } }),
      );
      return;
    }
    let result: unknown;
    if (route.pathname === "/v1/prices/price_fixture")
      result = {
        id: "price_fixture",
        active: true,
        currency: "usd",
        unit_amount: 1000,
        recurring: { interval: "month", interval_count: 1 },
      };
    else if (route.pathname === "/v1/subscriptions") {
      if (pause) {
        const waiting = pause;
        pause = undefined;
        reached?.();
        await waiting;
      }
      result = { object: "list", data: subscriptions, has_more: false };
    } else if (route.pathname === "/v1/checkout/sessions") {
      const key = String(request.headers["idempotency-key"]);
      let id = idempotency.get(key);
      if (!id) {
        id = "cs_" + (sessions.size + 1);
        idempotency.set(key, id);
        sessions.set(id, {
          id,
          status: "open",
          url: "https://checkout.stripe.com/" + id,
        });
      }
      result = sessions.get(id);
    } else if (route.pathname.endsWith("/expire")) {
      const session = sessions.get(route.pathname.split("/").at(-2)!)!;
      session.status = "expired";
      actions.push("expire");
      result = session;
    } else if (route.pathname.startsWith("/v1/checkout/sessions/"))
      result = sessions.get(route.pathname.split("/").at(-1)!);
    else if (
      route.pathname.startsWith("/v1/subscriptions/") &&
      request.method === "DELETE"
    ) {
      const sub = subscriptions.find(
        (s) => s.id === route.pathname.split("/").at(-1),
      );
      sub.status = "canceled";
      actions.push("cancel");
      result = sub;
    } else if (route.pathname === "/v1/invoices")
      result = {
        object: "list",
        data: invoices.filter(
          (i) =>
            !route.searchParams.get("status") ||
            i.status === route.searchParams.get("status"),
        ),
        has_more: false,
      };
    else if (route.pathname.endsWith("/void")) {
      const invoice = invoices.find(
        (i) => i.id === route.pathname.split("/").at(-2),
      );
      invoice.status = "void";
      actions.push("void");
      result = invoice;
    } else if (route.pathname === "/v1/billing_portal/sessions")
      result = { url: "https://billing.stripe.com/fixture" };
    else {
      response.writeHead(500);
      response.end(
        JSON.stringify({ error: { message: "Unexpected fixture route" } }),
      );
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  // Intercept only the SDK transport; application billing and SQL execute unchanged.
  t.mock.method(https, "request", ((options: any) => {
    assert.equal(options.host, "api.stripe.com");
    return http.request({
      host: "127.0.0.1",
      port: address.port,
      path: options.path,
      method: options.method,
      headers: options.headers,
    });
  }) as typeof https.request);
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
    Object.assign(process.env, {
      DATABASE_URL: url.toString(),
      STRIPE_SECRET_KEY: "sk_test_fixture",
      STRIPE_PRICE_ID: "price_fixture",
      STRIPE_PORTAL_CONFIGURATION_ID: "bpc_fixture",
    });
    const billing = await import("../lib/billing");
    const { expireAccount, expireAccounts, deleteAccount } =
      await import("../lib/accounts");
    pool = (await import("../lib/db")).pool;
    await db.query(
      "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,'Billing fixture','fixture')",
      [user, user + "@example.com"],
    );
    await paidAccount(db, user);
    await db.query(
      "UPDATE subscriptions SET customer_id='cus_fixture',paid_until=NULL,status='unpaid' WHERE user_id=$1",
      [user],
    );
    const first = await billing.checkout(user);
    assert.equal((await billing.checkout(user)).url, first.url);
    sessions.get("cs_1")!.status = "complete";
    const future = Math.floor(Date.now() / 1000) + 86400;
    const subscription = (status: string, end: number) => ({
      id: "sub_fixture",
      status,
      metadata: { evidence_user: user },
      items: {
        data: [
          {
            price: { id: "price_fixture" },
            quantity: 1,
            current_period_end: end,
          },
        ],
      },
      latest_invoice: { status: "paid" },
      cancel_at_period_end: status === "canceled",
    });
    const paidInvoice = (end: number) => ({
      id: "in_paid",
      status: "paid",
      parent: { subscription_details: { subscription: "sub_fixture" } },
      lines: {
        has_more: false,
        data: [
          {
            quantity: 1,
            amount: 1000,
            period: { end },
            pricing: { price_details: { price: "price_fixture" } },
          },
        ],
      },
    });
    invoices = [paidInvoice(future)];
    subscriptions = [subscription("active", future)];
    invoices = [paidInvoice(future)];
    assert.equal((await billing.reconcile(user)).active, true);
    assert.equal(
      (
        await db.query(
          "SELECT checkout_id FROM subscriptions WHERE user_id=$1",
          [user],
        )
      ).rows[0].checkout_id,
      "cs_1",
    );
    const past = Math.floor(Date.now() / 1000) - 31 * 86400;
    subscriptions = [subscription("canceled", past)];
    invoices = [paidInvoice(past)];
    await db.query(
      "UPDATE subscriptions SET paid_until=now()-interval '31 days' WHERE user_id=$1",
      [user],
    );
    await billing.reconcile(user);
    const second = await billing.checkout(user);
    assert.notEqual(
      second.url,
      first.url,
      "Resubscription must not reuse a completed checkout's idempotency key",
    );
    assert.equal((await billing.checkout(user)).url, second.url);

    sessions.get("cs_2")!.status = "expired";
    const third = await billing.checkout(user);
    assert.notEqual(
      third.url,
      second.url,
      "An expired checkout needs a fresh attempt",
    );
    subscriptions = [subscription("active", future)];
    invoices = [paidInvoice(future)];
    assert.equal(
      (await billing.checkout(user)).url,
      "https://billing.stripe.com/fixture",
      "An active subscription must go to its portal",
    );
    assert.equal(
      await expireAccount(user),
      false,
      "A newly paid customer cannot be expired before its webhook arrives",
    );
    subscriptions = [subscription("past_due", past)];
    const recent = Math.floor(Date.now() / 1000) - 86400;
    invoices = [paidInvoice(recent)];
    await db.query(
      "UPDATE subscriptions SET paid_until=now()-interval '61 days' WHERE user_id=$1",
      [user],
    );
    assert.equal(
      await expireAccount(user),
      false,
      "A missed paid renewal followed by an unpaid invoice must retain its remaining export window",
    );
    assert.ok(
      new Date(
        (
          await db.query(
            "SELECT paid_until FROM subscriptions WHERE user_id=$1",
            [user],
          )
        ).rows[0].paid_until,
      ).getTime() >
        Date.now() - 2 * 86400000,
    );
    invoices = [paidInvoice(past)];
    await db.query(
      "UPDATE subscriptions SET paid_until=now()-interval '31 days' WHERE user_id=$1",
      [user],
    );
    await billing.reconcile(user);
    invoices = [
      {
        id: "in_fixture",
        status: "open",
        parent: { subscription_details: { subscription: "sub_fixture" } },
      },
    ];
    let release!: () => void;
    pause = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inspecting = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const expiring = expireAccount(user);
    await inspecting;
    const purchase = assert.rejects(
      () => billing.checkout(user),
      (error: any) => error.status === 403,
    );
    let locked = false;
    for (let i = 0; i < 100; i++) {
      locked = (
        await db.query(
          "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FOR UPDATE OF u%') AS locked",
        )
      ).rows[0].locked;
      if (locked) break;
      await delay(10);
    }
    release();
    assert.equal(await expiring, true);
    await purchase;
    assert.equal(
      locked,
      true,
      "Expiry and checkout must serialize on the same owner lock",
    );
    assert.equal(
      (await db.query("SELECT id FROM users WHERE id=$1", [user])).rowCount,
      0,
    );
    assert.deepEqual(
      actions,
      ["expire", "cancel", "void"],
      "Expired workspaces close every unpaid payment path before deletion",
    );
    const deleting = randomUUID();
    await db.query(
      "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,'Deleting owner','fixture')",
      [deleting, deleting + "@example.com"],
    );
    await paidAccount(db, deleting);
    await db.query(
      "UPDATE subscriptions SET customer_id='cus_deleting' WHERE user_id=$1",
      [deleting],
    );
    subscriptions = [
      {
        ...subscription("past_due", past),
        metadata: { evidence_user: deleting },
      },
    ];
    invoices = [
      {
        id: "in_delete",
        status: "open",
        parent: { subscription_details: { subscription: "sub_fixture" } },
      },
    ];
    actions.length = 0;
    await deleteAccount(deleting);
    assert.deepEqual(
      actions,
      ["cancel", "void"],
      "Manual account deletion must also close invoice payment links",
    );
    assert.equal(
      (await db.query("SELECT id FROM users WHERE id=$1", [deleting])).rowCount,
      0,
    );
    // One failing batch must not monopolize every maintenance invocation.
    for (let i = 0; i < 21; i++) {
      const owner = randomUUID();
      await db.query(
        "INSERT INTO users(id,email,name,password_hash,cleanup_after) VALUES($1,$2,'Expiry fixture','fixture',now()+($3::int*interval '1 millisecond')-interval '1 minute')",
        [owner, owner + "@example.com", i],
      );
      await db.query(
        "INSERT INTO subscriptions(user_id,customer_id,paid_until) VALUES($1,$2,now()-interval '31 days')",
        [owner, i < 20 ? "cus_fail" + i : null],
      );
    }
    assert.equal(await expireAccounts(), 0);
    assert.equal(
      await expireAccounts(),
      1,
      "Later expired accounts must progress while failed accounts wait for retry",
    );
  } finally {
    await pool?.end();
    await db.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.env = previous;
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
});
