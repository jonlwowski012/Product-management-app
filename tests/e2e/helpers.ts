import { expect, Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { paidAccount } from "../fixtures/paid-account";
import { transcript, quote } from "../fixtures/transcripts";
export async function signup(page: Page) {
  const email = `tester-${randomUUID()}@example.com`;
  await page.context().setExtraHTTPHeaders({
    "x-real-ip": "2001:db8::" + randomUUID().replaceAll("-", "").slice(0, 4),
  });
  await page.goto("/");
  await page.getByLabel("Your name").fill("Alex Tester");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("a-secure-test-password");
  await page
    .getByRole("checkbox", { name: /I agree to the User Agreement/ })
    .check();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Turn customer conversations into product opportunities.",
    }),
  ).toBeVisible();
  const db = testDatabase();
  await db.connect();
  try {
    const {
      rows: [user],
    } = await db.query("SELECT id FROM users WHERE email=$1", [email]);
    await paidAccount(
      db,
      user.id,
      "gpt-4.1-mini",
      "openai",
      process.env.TEST_APP_SECRET ||
        "e2e-only-secret-not-for-real-use-1234567890",
    );
  } finally {
    await db.end();
  }
  await page.reload();
  return email;
}
export function testDatabase() {
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!,
  );
  if (!process.env.TEST_DATABASE_URL) url.pathname += "_e2e";
  if (!url.pathname.endsWith("_e2e"))
    throw new Error("Test fixtures require an isolated database");
  return new pg.Client({ connectionString: url.toString() });
}
export async function api(
  page: Page,
  path: string,
  input?: unknown,
  method = input ? "POST" : "GET",
) {
  const r = await page.request.fetch("/api/" + path, {
    method,
    data: input,
    maxRetries: method === "GET" ? 1 : 0,
  });
  const data = await r.json();
  expect(r.ok(), JSON.stringify(data)).toBeTruthy();
  return data;
}
export async function connect(page: Page, provider = "openai", model?: string) {
  if (model) {
    // Fault fixtures are configured through the API; model tuning has no UI.
    await api(
      page,
      "settings",
      {
        provider,
        model,
        validation_threshold: 1,
        api_key: "test-" + provider + "-" + randomUUID(),
      },
      "PATCH",
    );
    return;
  }
  await page.goto("/settings");
  await page.getByLabel("AI provider", { exact: true }).selectOption(provider);
  await page
    .getByLabel(/^(API key|Replace API key)$/)
    .fill("test-" + provider + "-" + randomUUID());
  await page
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Connection saved");
  await expect(page.getByText("Connected · key encrypted")).toBeVisible();
}

export async function seed(page: Page, content = transcript) {
  const c = await api(page, "customers", {
    name: "Acme " + randomUUID().slice(0, 6),
    segment: "Enterprise",
    notes: "",
  });
  const t = await api(page, "transcripts", {
    title: "Acme discovery",
    customer_id: c.id,
    content,
  });
  return { customer: c.id, transcript: t.transcripts[0].id };
}
export async function manual(
  page: Page,
  customer: string,
  tid: string,
  overrides: Record<string, unknown> = {},
) {
  return api(page, "signals", {
    title: "Audit trail",
    customer_id: customer,
    transcript_id: tid,
    quote,
    sentiment: "for",
    tier: 1,
    kind: "gap",
    commitments: ["pay"],
    review: "approved",
    ...overrides,
  });
}
export async function completed(
  page: Page,
  jobId: string,
  state = "succeeded",
  timeout = 30000,
) {
  await expect
    .poll(
      async () => {
        const b = await api(page, "bootstrap");
        return b.jobs.find((j: any) => j.id === jobId)?.state;
      },
      { timeout, intervals: [300, 500, 1000] },
    )
    .toBe(state);
  return api(page, "bootstrap");
}
