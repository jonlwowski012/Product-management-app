import { test, expect, Page } from "@playwright/test";
import { signup, api, connect } from "./helpers";
import { pdfFixture, officeFixture } from "../fixtures/documents";
import { demoId } from "../../lib/demo-constants";
const quote = "We need audit logs before we can buy.";
async function ready(page: Page) {
  await expect(page).toHaveURL(/\/reports\//);
  await expect(
    page.getByRole("heading", {
      name: "Your discovery opportunities",
      exact: true,
    }),
  ).toBeVisible({ timeout: 60000 });
  return page.url().split("/").pop()!;
}
async function noteSource(page: Page, content = quote) {
  return (
    await api(page, "sources", { filename: "Interview notes.txt", content })
  ).sources[0].id;
}
async function waitReport(page: Page, rid: string, state = "succeeded") {
  await expect
    .poll(
      async () => {
        const r = await api(page, "reports/" + rid);
        return r.job.state;
      },
      { timeout: 60000, intervals: [500, 1000] },
    )
    .toBe(state);
  return api(page, "reports/" + rid);
}
test("one action analyzes untimestamped notes without customer or provider setup", async ({
  page,
}) => {
  await signup(page);
  await expect(
    page.getByRole("navigation", { name: "Workspace navigation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Features", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("What are you trying to learn?")
    .fill("What is delaying adoption?");
  await page
    .getByLabel("Or paste customer notes")
    .fill(
      quote +
        "\nWe do not need detailed audit history for our three-person team.",
    );
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  const rid = await ready(page);
  await expect(page.getByTestId("opportunity-card")).toHaveCount(1);
  const card = page.getByTestId("opportunity-card");
  await expect(card).toContainText("Interview three customer owners");
  await card.locator("summary").filter({ hasText: "View evidence" }).click();
  await expect(card).toContainText("We do not need detailed audit history");
  await card
    .getByRole("button", { name: /Interview notes|Customer notes/ })
    .first()
    .click();
  await expect(page.getByRole("dialog").locator("mark")).toHaveText(quote);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await expect(page.getByTestId("opportunity-card")).toHaveCount(1);
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Next validation step", { exact: true })
    .fill("Ask Sam to demonstrate the last compliance review.");
  await page.getByRole("button", { name: "Save opportunity" }).click();
  await expect(card.locator(".flow-edit")).not.toBeVisible();
  await expect(card).toContainText("Ask Sam to demonstrate");
  const md = await page.request.get("/api/reports/" + rid + "/export");
  expect(md.ok()).toBeTruthy();
  expect(await md.text()).toContain("Ask Sam to demonstrate");
  const workspace = await api(page, "bootstrap");
  expect(workspace.customers).toHaveLength(0);
  expect(workspace.features).toHaveLength(0);
  const report = await api(page, "reports/" + rid);
  expect(report.job.billing_mode).toBe("byok");
});
test("mixed PDF, slides and DOCX upload preserves citations and keeps context out of support", async ({
  page,
}) => {
  await signup(page);
  await page.getByLabel("Discovery files").setInputFiles([
    {
      name: "Research.pdf",
      mimeType: "application/pdf",
      buffer: pdfFixture([
        quote,
        "We do not need detailed audit history for our three-person team.",
      ]),
    },
    {
      name: "Strategy.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: officeFixture("pptx", [
        "Our internal roadmap says audit logs are important.",
      ]),
    },
    {
      name: "Customer notes.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: officeFixture("docx", [
        "I would pay for searchable audit history.",
      ]),
    },
  ]);
  await page
    .getByLabel("Source type for Strategy.pptx", { exact: true })
    .selectOption("context");
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  const rid = await ready(page);
  const report = await api(page, "reports/" + rid);
  const internal = report.sources.find(
    (s: any) => s.filename === "Strategy.pptx",
  );
  const context = report.result.findings.filter(
    (f: any) => f.source_id === internal.id,
  );
  expect(context.length).toBeGreaterThan(0);
  expect(
    context.every(
      (f: any) => f.origin === "internal" && f.stance === "context",
    ),
  ).toBe(true);
  expect(
    report.result.opportunities[0].supporting_ids.some((id: string) =>
      context.some((f: any) => f.id === id),
    ),
  ).toBe(false);
  await page.locator(".flow-evidence>summary").click();
  await page.getByRole("button", { name: /Research.pdf · Page 2/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Page 2");
  await expect(page.locator("mark")).toContainText("three-person team");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.locator(".flow-source-list>summary").click();
  await expect(page.locator(".flow-source-list")).toContainText(
    "scanned text require OCR",
  );
});
test("adding material creates report history and reuses prior source findings", async ({
  page,
}) => {
  await signup(page);
  await page.getByLabel("Or paste customer notes").fill(quote);
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  const first = await ready(page);
  const prior = await api(page, "reports/" + first);
  const usageBefore = (await api(page, "flow")).usage;
  await page
    .getByRole("button", { name: "Add more material", exact: true })
    .click();
  await page
    .getByLabel("Or paste customer notes")
    .fill("I would pay for searchable audit history.");
  await page.getByRole("button", { name: "Update opportunities" }).click();
  await expect(page).not.toHaveURL(new RegExp(first + "$"));
  const next = await ready(page);
  expect(next).not.toBe(first);
  await expect(page.getByText("What changed", { exact: true })).toBeVisible();
  const newer = await api(page, "reports/" + next);
  expect(newer.sources).toHaveLength(2);
  expect(newer.result.findings).toHaveLength(prior.result.findings.length + 1);
  const after = (await api(page, "flow")).usage;
  expect(after).toBeUndefined();
  const cached = await api(page, "reports", {
    question: newer.question,
    product_context: newer.product_context,
    parent_id: next,
    sources: newer.sources.map((s: any) => ({ id: s.id, role: s.role })),
  });
  expect(cached.id).toBe(next);
  expect((await api(page, "flow")).usage).toEqual(after);
  await page.getByLabel("Report history", { exact: true }).selectOption(first);
  await expect(page).toHaveURL(new RegExp(first + "$"));
  await expect(page.getByTestId("opportunity-card")).toHaveCount(1);
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("opportunity-card")).toHaveCount(1);
  await expect(page.locator(".flow-summary-bottom")).toContainText("2 sources");
});
test("company context alone produces an honest empty report", async ({
  page,
}) => {
  await signup(page);
  await page
    .getByLabel("Or paste customer notes")
    .fill("Our internal roadmap says audit logs are important.");
  await page.getByLabel("Notes source type").selectOption("context");
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  await ready(page);
  await expect(page.getByTestId("opportunity-card")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "More customer evidence is needed" }),
  ).toBeVisible();
});
test("scanned PDFs warn clearly without publishing an empty report", async ({
  page,
}) => {
  await signup(page);
  await page.getByLabel("Discovery files").setInputFiles({
    name: "scan.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture([""]),
  });
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  await expect(page.getByLabel("Import warnings")).toContainText("OCR");
  await expect(page.locator(".flow-error[role=alert]")).toContainText(
    "No documents could be imported",
  );
  expect((await api(page, "flow")).reports).toHaveLength(0);
});
test("invalid AI citations fail safely and can retry within a bounded allowance", async ({
  page,
}) => {
  await signup(page);
  await connect(page, "openai", "mock-bad-citation");
  const sid = await noteSource(page);
  const created = await api(page, "reports", {
    sources: [{ id: sid, role: "auto" }],
  });
  const report = await waitReport(page, created.id, "failed");
  expect(report.result).toBeNull();
  expect(report.job.error).toContain("did not match");
  await page.goto("/reports/" + created.id);
  await expect(
    page.getByRole("heading", { name: "Your analysis needs attention" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry analysis" }),
  ).toBeEnabled();
});
test("private reports, citations, exports, mutations and cross-origin requests are isolated", async ({
  page,
  browser,
}) => {
  await signup(page);
  const sid = await noteSource(page);
  const r = await api(page, "reports", {
    sources: [{ id: sid, role: "auto" }],
  });
  await waitReport(page, r.id);
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
  });
  const other = await context.newPage();
  await signup(other);
  for (const route of [
    "reports/" + r.id,
    "reports/" + r.id + "/export",
    "sources/" + sid,
  ])
    expect((await other.request.get("/api/" + route)).status()).toBe(404);
  expect(
    (
      await other.request.post("/api/reports", {
        data: { sources: [{ id: sid, role: "auto" }] },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.post("/api/reports", {
        headers: { Origin: "https://evil.example" },
        data: { sources: [{ id: sid, role: "auto" }] },
      })
    ).status(),
  ).toBe(403);
  await context.close();
});
test("public demo uses the same short report and stays read only", async ({
  page,
}) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Explore demo", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Your discovery opportunities",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByTestId("opportunity-card")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Add more material", exact: true }),
  ).toBeDisabled();
  expect(
    (
      await page.request.post("/api/demo/reports", { data: { sources: [] } })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.patch("/api/demo/reports/" + demoId(1000) + "/edit", {
        data: {},
      })
    ).status(),
  ).toBe(403);
  await page
    .getByTestId("opportunity-card")
    .first()
    .locator("summary")
    .filter({ hasText: "View evidence" })
    .click();
  await page
    .getByRole("button", { name: /Anonymized excerpt/ })
    .first()
    .click();
  await expect(page.getByRole("dialog").locator("mark")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.screenshot({
    path: ".local/simple-demo-desktop.png",
    fullPage: true,
  });
});

test("paid access is enforced and unchanged reports are reused", async ({
  page,
}) => {
  const { default: pg } = await import("pg");
  await signup(page);
  const meta = await api(page, "flow");
  const sid = await noteSource(page);
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!,
  );
  if (!process.env.TEST_DATABASE_URL) url.pathname += "_e2e";
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query(
      "INSERT INTO included_usage(user_id,month,runs) VALUES($1,date_trunc('month',now())::date,29) ON CONFLICT(user_id,month) DO UPDATE SET runs=29",
      [meta.user.id],
    );
    const input = { sources: [{ id: sid, role: "auto" }] };
    const created = await api(page, "reports", input);
    await waitReport(page, created.id);
    const cached = await api(page, "reports", input);
    expect(cached.id).toBe(created.id);
    expect(cached.cached).toBe(true);
    await db.query(
      "UPDATE subscriptions SET paid_until=now()-interval '1 day' WHERE user_id=$1",
      [meta.user.id],
    );
    const denied = await page.request.post("/api/reports", {
      data: { ...input, question: "Another question" },
    });
    expect(denied.status()).toBe(402);
    expect((await api(page, "flow")).reports).toHaveLength(1);
    expect((await api(page, "flow")).billing.active).toBe(false);
  } finally {
    await db.end();
  }
});
test("Anthropic BYOK can generate the same opportunity report", async ({
  page,
}) => {
  await signup(page);
  await connect(page, "anthropic");
  const sid = await noteSource(page);
  const created = await api(page, "reports", {
    sources: [{ id: sid, role: "auto" }],
  });
  const r = await waitReport(page, created.id);
  expect(r.result.opportunities).toHaveLength(1);
  expect(r.job.billing_mode).toBe("byok");
});
