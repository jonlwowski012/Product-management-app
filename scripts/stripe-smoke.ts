import "dotenv/config";
import { config } from "dotenv";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
config({ path: ".env.local", quiet: true });
const { stripe, checkout, reconcile, processBillingEvent } =
  await import("../lib/billing");
const { query, pool } = await import("../lib/db");
const { paidAccount } = await import("../tests/fixtures/paid-account");
const api = stripe();
const price = await api.prices.retrieve(process.env.STRIPE_PRICE_ID!);
assert.equal(price.livemode, false, "Only a Stripe sandbox may run this check");
assert.equal(price.unit_amount, 1000);
const user = randomUUID();
let customer: string | undefined;
let subscription: string | undefined;
try {
  await query(
    "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,'Synthetic billing check','fixture')",
    [user, user + "@example.com"],
  );
  await paidAccount(pool, user);
  await query(
    "UPDATE subscriptions SET status='unpaid',paid_until=NULL WHERE user_id=$1",
    [user],
  );
  const session = await checkout(user);
  assert.ok(session.url?.startsWith("https://checkout.stripe.com/"));
  assert.equal(
    (await checkout(user)).url,
    session.url,
    "Repeated checkout must reuse its session",
  );
  const [billing] = await query(
    "SELECT customer_id,checkout_id FROM subscriptions WHERE user_id=$1",
    [user],
  );
  customer = billing.customer_id;
  await api.checkout.sessions.expire(billing.checkout_id);
  await query("UPDATE subscriptions SET checkout_id=NULL WHERE user_id=$1", [
    user,
  ]);
  assert.equal(
    (await reconcile(user)).active,
    false,
    "An unpaid checkout cannot grant access",
  );
  const method = await api.paymentMethods.create({
    type: "card",
    card: { token: "tok_visa" },
  });
  await api.paymentMethods.attach(method.id, { customer: customer! });
  const created = await api.subscriptions.create({
    customer: customer!,
    items: [{ price: price.id }],
    default_payment_method: method.id,
    payment_behavior: "error_if_incomplete",
    metadata: { evidence_user: user },
  });
  subscription = created.id;
  assert.equal((await reconcile(user)).active, true);
  await api.subscriptions.update(subscription, { cancel_at_period_end: true });
  const cancelled = await reconcile(user);
  assert.equal(
    cancelled.active,
    true,
    "Cancellation must preserve the paid period",
  );
  assert.equal(cancelled.cancelAtPeriodEnd, true);
  const event = {
    id: "evt_smoke_" + randomUUID(),
    type: "customer.subscription.updated",
    data: { object: { customer } },
  } as any;
  await processBillingEvent(event);
  await processBillingEvent(event);
  assert.equal(
    (await query("SELECT id FROM billing_events WHERE id=$1", [event.id]))
      .length,
    1,
  );
  console.log(
    "Stripe sandbox passed: $10 price, checkout reuse, unpaid denial, paid access, end-of-period cancellation, duplicate-event handling.",
  );
} finally {
  if (subscription) await api.subscriptions.cancel(subscription);
  if (customer) await api.customers.del(customer);
  await query("DELETE FROM users WHERE id=$1", [user]);
  await pool.end();
}
