import type pg from "pg";
import { createHmac } from "node:crypto";
import { AppError, query, transaction } from "./db";
import { checkPassword, hashPassword } from "./auth";
import { stripe, syncCustomer } from "./billing";

const accountFingerprint = (identity: string) =>
  createHmac("sha256", process.env.APP_SECRET!).update(identity).digest("hex");
export async function accountRateLimit(identity: string, limit = 5) {
  const fingerprint = accountFingerprint(identity);
  await transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [fingerprint]);
    const {
      rows: [count],
    } = await c.query(
      "SELECT count(*)::int AS n FROM auth_attempts WHERE identity=$1 AND created_at>now()-interval '15 minutes'",
      [fingerprint],
    );
    if (count.n >= limit)
      throw new AppError("Too many attempts. Try again in 15 minutes.", 429);
    await c.query("INSERT INTO auth_attempts(identity) VALUES($1)", [
      fingerprint,
    ]);
  });
  return fingerprint;
}
async function confirmPassword(
  c: pg.PoolClient,
  user: string,
  password: string,
) {
  const {
    rows: [account],
  } = await c.query(
    "SELECT password_hash,is_demo FROM users WHERE id=$1 FOR UPDATE",
    [user],
  );
  if (
    !account ||
    account.is_demo ||
    !checkPassword(password, account.password_hash)
  )
    throw new AppError("Your current password is incorrect", 403);
}
export async function changePassword(
  user: string,
  current: string,
  next: string,
) {
  await accountRateLimit("password:" + user);
  await transaction(async (c) => {
    await confirmPassword(c, user, current);
    await c.query(
      "UPDATE users SET password_hash=$2 WHERE id=$1 AND deletion_requested_at IS NULL",
      [user, hashPassword(next)],
    );
    await c.query("DELETE FROM sessions WHERE user_id=$1", [user]);
  });
}
export async function revokeSessions(user: string) {
  await transaction(async (c) => {
    await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user]);
    await c.query("DELETE FROM sessions WHERE user_id=$1", [user]);
  });
}
async function closeBilling(
  user: string,
  billing: { customer_id: string; checkout_id: string | null },
) {
  const api = stripe();
  if (billing.checkout_id) {
    const session = await api.checkout.sessions.retrieve(billing.checkout_id);
    if (session.status === "open")
      await api.checkout.sessions.expire(session.id);
  }
  const subscriptions = await api.subscriptions.list({
    customer: billing.customer_id,
    status: "all",
    limit: 100,
  });
  if (subscriptions.has_more)
    throw new AppError("Subscription cleanup requires operator review", 503);
  const owned = subscriptions.data.filter(
    (s) => s.metadata.evidence_user === user,
  );
  for (const subscription of owned) {
    if (!["canceled", "incomplete_expired"].includes(subscription.status))
      await api.subscriptions.cancel(subscription.id, {
        invoice_now: false,
        prorate: false,
      });
  }
  for (const status of ["draft", "open", "uncollectible"] as const) {
    for await (const invoice of api.invoices.list({
      customer: billing.customer_id,
      status,
      limit: 100,
    })) {
      const parent = invoice.parent?.subscription_details?.subscription;
      const sid = typeof parent === "string" ? parent : parent?.id;
      if (!owned.some((s) => s.id === sid)) continue;
      if (status === "draft") await api.invoices.del(invoice.id);
      else await api.invoices.voidInvoice(invoice.id);
    }
  }
}
export async function deleteAccount(user: string, password?: string) {
  if (password !== undefined) await accountRateLimit("password:" + user);
  const account = await transaction(async (c) => {
    if (password !== undefined) await confirmPassword(c, user, password);
    const {
      rows: [account],
    } = await c.query(
      "UPDATE users SET deletion_requested_at=coalesce(deletion_requested_at,now()) WHERE id=$1 AND NOT is_demo RETURNING id,email",
      [user],
    );
    if (!account) throw new AppError("Account not found", 404);
    await c.query(
      "UPDATE settings SET openai_key=NULL,anthropic_key=NULL,groq_key=NULL,gemini_key=NULL WHERE user_id=$1",
      [user],
    );
    return account;
  });
  const [billing] = await query(
    "SELECT customer_id,checkout_id FROM subscriptions WHERE user_id=$1",
    [user],
  );
  if (billing?.customer_id)
    await closeBilling(user, {
      customer_id: billing.customer_id,
      checkout_id: billing.checkout_id,
    });
  await transaction(async (c) => {
    await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user]);
    await c.query("SET CONSTRAINTS ALL DEFERRED");
    await c.query(
      `INSERT INTO storage_deletions(pathname)
      SELECT storage_path FROM transcripts WHERE user_id=$1 AND storage_path<>''
      UNION SELECT storage_path FROM discovery_sources WHERE user_id=$1 AND storage_path IS NOT NULL
      UNION SELECT storage_key FROM discovery_sources WHERE user_id=$1 AND storage_key IS NOT NULL
      ON CONFLICT DO NOTHING`,
      [user],
    );
    await c.query(
      `INSERT INTO storage_deletions(pathname,not_before)
      SELECT 'blob:'||pathname,greatest(now(),expires_at)+interval '1 day' FROM upload_reservations WHERE user_id=$1
      UNION ALL SELECT 'blob:'||blob_url,greatest(now(),expires_at)+interval '1 day' FROM upload_reservations WHERE user_id=$1 AND blob_url IS NOT NULL
      ON CONFLICT(pathname) DO UPDATE SET not_before=greatest(storage_deletions.not_before,excluded.not_before)`,
      [user],
    );
    await c.query("DELETE FROM users WHERE id=$1 AND NOT is_demo", [user]);
    await c.query(
      "DELETE FROM auth_attempts WHERE identity=$1 OR identity=$2",
      [account.email, accountFingerprint("auth-email:" + account.email)],
    );
  });
}
export async function expireAccount(user: string) {
  const remove = await transaction(async (c) => {
    const {
      rows: [account],
    } = await c.query(
      "SELECT is_demo,deletion_requested_at FROM users WHERE id=$1 FOR UPDATE",
      [user],
    );
    if (!account || account.is_demo) return false;
    if (account.deletion_requested_at) return true;
    const {
      rows: [billing],
    } = await c.query(
      "SELECT * FROM subscriptions WHERE user_id=$1 FOR UPDATE",
      [user],
    );
    if (
      !billing?.paid_until ||
      new Date(billing.paid_until).getTime() + 30 * 86400000 >= Date.now()
    )
      return false;
    if (billing.customer_id) {
      const api = stripe();
      await syncCustomer(billing.customer_id, c);
      const expired = async () =>
        (
          await c.query(
            "SELECT paid_until<now()-interval '30 days' AS expired FROM subscriptions WHERE user_id=$1",
            [user],
          )
        ).rows[0]?.expired;
      if (!(await expired())) return false;
      // Close payable invoices before deleting; a concurrent successful payment defers cleanup.
      await closeBilling(user, {
        customer_id: billing.customer_id,
        checkout_id: billing.checkout_id,
      });
      await syncCustomer(billing.customer_id, c);
      if (!(await expired())) return false;
    }
    const marked = await c.query(
      "UPDATE users SET deletion_requested_at=now() WHERE id=$1 AND EXISTS(SELECT 1 FROM subscriptions WHERE user_id=$1 AND paid_until<now()-interval '30 days') RETURNING id",
      [user],
    );
    return !!marked.rowCount;
  });
  if (remove) await deleteAccount(user);
  return remove;
}
export async function expireAccounts() {
  const accounts = await query(
    "UPDATE users SET cleanup_after=now()+interval '15 minutes' WHERE id IN (SELECT u.id FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id WHERE NOT u.is_demo AND u.cleanup_after<=now() AND (u.deletion_requested_at IS NOT NULL OR s.paid_until<now()-interval '30 days') ORDER BY u.cleanup_after,u.id LIMIT 20 FOR UPDATE OF u SKIP LOCKED) RETURNING id",
  );
  let deleted = 0;
  for (const account of accounts) {
    try {
      if (await expireAccount(account.id)) deleted++;
    } catch {
      console.error("Account cleanup needs retry", account.id);
    }
  }
  return deleted;
}
