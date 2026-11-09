import Stripe from "stripe";
import { AppError, query, transaction } from "./db";
import type pg from "pg";

export const MONTHLY_PRICE_CENTS = 1000;
export const READ_ONLY_DAYS = 30;
export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new AppError(
      "Subscriptions are temporarily unavailable. Please try again later.",
      503,
    );
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    timeout: 15000,
    maxNetworkRetries: 2,
  });
}
export function appOrigin() {
  const origin = new URL(process.env.APP_URL || "http://127.0.0.1:3000");
  if (process.env.NODE_ENV === "production" && origin.protocol !== "https:")
    throw new AppError("A secure application URL is required", 503);
  return origin.origin;
}
async function portalSession(customer: string) {
  if (!process.env.STRIPE_PORTAL_CONFIGURATION_ID)
    throw new AppError(
      "Subscription management is temporarily unavailable",
      503,
    );
  return stripe().billingPortal.sessions.create({
    customer,
    configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID,
    return_url: appOrigin() + "/settings",
  });
}
export function paidAccess(
  paidUntil: Date | string | null,
  deleting = false,
  now = Date.now(),
) {
  return !deleting && !!paidUntil && new Date(paidUntil).getTime() > now;
}
export async function billingStatus(user: string) {
  const [row] = await query(
    "SELECT u.deletion_requested_at,s.status,s.paid_until,s.cancel_at_period_end,s.customer_id IS NOT NULL AS has_customer FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id WHERE u.id=$1",
    [user],
  );
  return {
    active: paidAccess(row?.paid_until, !!row?.deletion_requested_at),
    status: row?.status || "unpaid",
    paidUntil: row?.paid_until ?? null,
    cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
    hasCustomer: row?.has_customer ?? false,
    readUntil: row?.paid_until
      ? new Date(
          new Date(row.paid_until).getTime() + READ_ONLY_DAYS * 86400000,
        ).toISOString()
      : null,
  };
}
export async function checkout(user: string) {
  const api = stripe();
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId)
    throw new AppError("Subscriptions are temporarily unavailable", 503);
  const price = await api.prices.retrieve(priceId);
  if (
    !price.active ||
    price.unit_amount !== MONTHLY_PRICE_CENTS ||
    price.currency !== "usd" ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1
  )
    throw new AppError(
      "The subscription price is not configured as $10 USD per month",
      503,
    );
  return transaction(async (c) => {
    const {
      rows: [account],
    } = await c.query(
      "SELECT u.*,s.provider,s.openai_key,s.anthropic_key,s.groq_key,s.gemini_key FROM users u JOIN settings s ON s.user_id=u.id WHERE u.id=$1 FOR UPDATE OF u",
      [user],
    );
    if (!account || account.is_demo || account.deletion_requested_at)
      throw new AppError("This account cannot subscribe", 403);
    if (!account[account.provider + "_key"])
      throw new AppError(
        "Connect your AI provider in Settings before subscribing",
      );
    await c.query(
      "INSERT INTO subscriptions(user_id) VALUES($1) ON CONFLICT DO NOTHING",
      [user],
    );
    const {
      rows: [billing],
    } = await c.query(
      "SELECT * FROM subscriptions WHERE user_id=$1 FOR UPDATE",
      [user],
    );
    if (
      billing.paid_until &&
      new Date(billing.paid_until).getTime() > Date.now()
    )
      throw new AppError(
        "You already have a subscription. Use Manage subscription.",
        409,
      );
    let customer = billing.customer_id;
    if (!customer) {
      customer = (
        await api.customers.create(
          { email: account.email, metadata: { evidence_user: user } },
          { idempotencyKey: "evidence-customer-" + user },
        )
      ).id;
      await c.query(
        "UPDATE subscriptions SET customer_id=$2 WHERE user_id=$1",
        [user, customer],
      );
    }
    const existingSubscriptions = await api.subscriptions.list({
      customer,
      status: "all",
      limit: 100,
    });
    if (existingSubscriptions.has_more)
      throw new AppError("Contact support to review your subscriptions", 409);
    if (
      existingSubscriptions.data.some(
        (s) =>
          s.metadata.evidence_user === user &&
          !["canceled", "incomplete_expired"].includes(s.status),
      )
    )
      return { url: (await portalSession(customer)).url };
    // Reuse open checkout sessions so repeat clicks cannot create two subscriptions.
    if (billing.checkout_id) {
      const existing = await api.checkout.sessions.retrieve(
        billing.checkout_id,
      );
      if (existing.status === "open") return { url: existing.url };
    }
    const session = await api.checkout.sessions.create(
      {
        customer,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: user,
        subscription_data: { metadata: { evidence_user: user } },
        success_url: appOrigin() + "/settings?payment=complete",
        cancel_url: appOrigin() + "/settings?payment=cancelled",
      },
      {
        idempotencyKey:
          "evidence-checkout-" + user + "-" + (billing.checkout_id || "first"),
      },
    );
    await c.query("UPDATE subscriptions SET checkout_id=$2 WHERE user_id=$1", [
      user,
      session.id,
    ]);
    return { url: session.url };
  });
}
export async function portal(user: string) {
  const [billing] = await query(
    "SELECT customer_id FROM subscriptions WHERE user_id=$1",
    [user],
  );
  if (!billing?.customer_id)
    throw new AppError("No subscription to manage", 404);
  const session = await portalSession(billing.customer_id);
  return { url: session.url };
}
export async function syncCustomer(customer: string, c: pg.PoolClient) {
  const {
    rows: [billing],
  } = await c.query(
    "SELECT * FROM subscriptions WHERE customer_id=$1 FOR UPDATE",
    [customer],
  );
  if (!billing) return;
  const api = stripe();
  // Fetch current provider state under the row lock; delayed events cannot roll access backward.
  const subscriptions = await api.subscriptions.list({
    customer,
    status: "all",
    limit: 100,
  });
  if (subscriptions.has_more)
    throw new AppError(
      "Subscription reconciliation requires operator review",
      503,
    );
  const matching = subscriptions.data.filter(
    (s) =>
      s.metadata.evidence_user === billing.user_id &&
      s.items.data.some(
        (i) => i.price.id === process.env.STRIPE_PRICE_ID && i.quantity === 1,
      ),
  );
  const current = matching.find((s) => s.status === "active") ?? matching[0];
  if (!current) return;
  let paidUntil = billing.paid_until ? new Date(billing.paid_until) : null;
  // Settled history survives missed webhooks and newer unpaid renewals.
  for await (const invoice of api.invoices.list({
    customer,
    status: "paid",
    limit: 100,
  })) {
    const parent = invoice.parent?.subscription_details?.subscription;
    const subscriptionId = typeof parent === "string" ? parent : parent?.id;
    if (!matching.some((s) => s.id === subscriptionId)) continue;
    const lines = invoice.lines.has_more
      ? api.invoices.listLineItems(invoice.id, { limit: 100 })
      : invoice.lines.data;
    for await (const line of lines) {
      const price = line.pricing?.price_details?.price;
      if (
        (typeof price === "string" ? price : price?.id) !==
          process.env.STRIPE_PRICE_ID ||
        line.quantity !== 1 ||
        line.amount < 0
      )
        continue;
      const end = new Date(line.period.end * 1000);
      if (!paidUntil || end > paidUntil) paidUntil = end;
    }
  }
  await c.query(
    "UPDATE subscriptions SET subscription_id=$2,status=$3,paid_until=$4,cancel_at_period_end=$5,updated_at=now() WHERE user_id=$1",
    [
      billing.user_id,
      current.id,
      current.status,
      paidUntil,
      current.cancel_at_period_end,
    ],
  );
}
export async function reconcile(user: string) {
  const [billing] = await query(
    "SELECT customer_id FROM subscriptions WHERE user_id=$1",
    [user],
  );
  if (billing?.customer_id)
    await transaction((c) => syncCustomer(billing.customer_id, c));
  return billingStatus(user);
}
export async function processBillingEvent(event: Stripe.Event) {
  const supported = new Set([
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed",
  ]);
  if (!supported.has(event.type)) return;
  const object = event.data.object as {
    customer?: string | { id: string } | null;
  };
  const customer =
    typeof object.customer === "string" ? object.customer : object.customer?.id;
  if (!customer) return;
  await transaction(async (c) => {
    const inserted = await c.query(
      "INSERT INTO billing_events(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id",
      [event.id],
    );
    if (inserted.rowCount) await syncCustomer(customer, c);
  });
}
