import { test, expect } from "@playwright/test";
import { signup, api, connect } from "./helpers";
import { readDocument } from "../../lib/documents";
const quote = "We need audit logs before we can buy.";
test("report copy, Markdown and print PDF deliver the same useful findings", async ({
  page,
  context,
}) => {
  await signup(page);
  await page.getByLabel("Or paste customer notes").fill(quote);
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your discovery opportunities",
      exact: true,
    }),
  ).toBeVisible({ timeout: 60000 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy report", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Copied", exact: true }),
  ).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(quote);
  expect(copied).toContain("Next step");
  const rid = page.url().split("/").pop();
  const exported = await page.request.get("/api/reports/" + rid + "/export");
  expect(await exported.text()).toBe(copied);
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  const text = await readDocument("report.pdf", pdf);
  expect(text.pages.map((p) => p.text).join("\n")).toContain(
    "Make approval changes easier to explain",
  );
  await page
    .getByRole("link", { name: "Settings", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your account",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("AI provider", { exact: true })).toBeVisible();
});
test("a generated report cannot turn internal context into customer evidence", async ({
  page,
}) => {
  await signup(page);
  await connect(page, "openai", "mock-context-leak");
  const source = await api(page, "sources", {
    filename: "Strategy.txt",
    content: "Our internal roadmap says audit logs are important.",
  });
  const r = await api(page, "reports", {
    sources: [{ id: source.sources[0].id, role: "context" }],
  });
  await expect
    .poll(
      async () => {
        const report = await api(page, "reports/" + r.id);
        return report.job.state;
      },
      { timeout: 60000 },
    )
    .toBe("failed");
  const failed = await api(page, "reports/" + r.id);
  expect(failed.result).toBeNull();
  expect(failed.job.error).toContain("Internal context");
});
test("original uploads remain available after expired upload reservations are cleaned", async ({
  page,
}) => {
  const { default: pg } = await import("pg");
  await signup(page);
  await page.getByLabel("Discovery files").setInputFiles({
    name: "Customer.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(quote),
  });
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your discovery opportunities",
      exact: true,
    }),
  ).toBeVisible({ timeout: 60000 });
  const report = await api(page, "reports/" + page.url().split("/").pop());
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!,
  );
  if (!process.env.TEST_DATABASE_URL) url.pathname += "_e2e";
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  try {
    const identity = (await api(page, "flow")).user.id;
    await db.query(
      "UPDATE upload_reservations SET expires_at=now()-interval '1 day' WHERE user_id=$1",
      [identity],
    );
    const cleaned = await page.request.get("/api/maintenance", {
      headers: { Authorization: "Bearer e2e-maintenance-secret" },
    });
    expect(cleaned.ok()).toBe(true);
    const original = await page.request.get(
      "/api/sources/" + report.sources[0].id + "/download",
    );
    expect(original.ok()).toBe(true);
    expect(await original.text()).toBe(quote);
  } finally {
    await db.end();
  }
});
