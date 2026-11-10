import { test, expect, type Page } from "@playwright/test";
import { signup, api, seed, manual } from "./helpers";
import pg from "pg";
import { randomUUID } from "node:crypto";
import "dotenv/config";
const quote = "We need audit logs before we can buy.";
async function analyze(page: Page, company = "", date = "") {
  await page.goto("/?new=1");
  await page
    .getByLabel("Or paste customer notes")
    .fill(
      (company ? "Company: " + company + "\n" : "") +
        (date ? "Date: " + date + "\n" : "") +
        quote,
    );
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  await expect(page.getByTestId("opportunity-card")).toHaveCount(1, {
    timeout: 60000,
  });
  return page.url().split("/").pop()!;
}
async function navigation(page: Page, label: string) {
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: label, exact: true })
    .click();
}

test("company history and recurring themes populate from the same analysis with source drill-down", async ({
  page,
}) => {
  await signup(page);
  const rid = await analyze(page, "Acme", "2026-10-10");
  await navigation(page, "Customers");
  const company = page.getByTestId("company-row");
  await expect(company).toHaveCount(1);
  await expect(company).toContainText("Acme");
  await expect(company).toContainText("Oct 10, 2026");
  await company.click();
  await expect(
    page.getByRole("heading", { name: "What we have learned", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("conversation-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Open notes", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Company: Acme");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await analyze(page, "Beta", "2026-10-20");
  await navigation(page, "Signals");
  await expect(page.getByTestId("theme-card")).toHaveCount(1);
  await expect(page.getByTestId("theme-card")).toContainText(
    "Make approval changes easier to explain",
  );
  await expect(page.getByTestId("theme-card")).toContainText(
    "2 linked companies",
  );
  await page.getByTestId("theme-card").click();
  await expect(page.getByTestId("research-signal")).toHaveCount(2);
  await page
    .getByTestId("research-signal")
    .first()
    .getByRole("button", { name: /Customer notes.txt/ })
    .click();
  await expect(page.getByRole("dialog").locator("mark")).toHaveText(quote);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.screenshot({
    path: ".local/research-signals-desktop.png",
    fullPage: true,
  });
  const original = await api(page, "reports/" + rid);
  expect(original.result.findings[0].quote).toBe(quote);
});

test("unclear companies can be confirmed, renamed and merged without changing source history", async ({
  page,
}) => {
  await signup(page);
  const rid = await analyze(page);
  await navigation(page, "Customers");
  await page
    .getByRole("link", { name: "Confirm companies", exact: true })
    .click();
  await expect(page.getByTestId("conversation-row")).toContainText(
    "Date not recorded",
  );
  await page
    .getByRole("button", { name: "Confirm company", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Company", { exact: true }).fill("Acme");
  await dialog
    .getByLabel("Conversation date", { exact: true })
    .fill("2026-09-15");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("link", { name: "All customers", exact: true }).click();
  await page.getByTestId("company-row").click();
  await page.getByLabel("Company actions", { exact: true }).click();
  await page
    .getByRole("button", { name: "Rename company", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Company name", { exact: true })
    .fill("Acme Incorporated");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Acme Incorporated", exact: true }),
  ).toBeVisible();
  const cid = page.url().split("/").pop()!;
  await analyze(page, "Beta", "2026-10-20");
  await page.goto("/customers/" + cid);
  await page.getByLabel("Company actions", { exact: true }).click();
  await page
    .getByRole("button", { name: "Merge companies", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  const target = (await api(page, "library/options?q=Beta")).items[0];
  await dialog
    .getByLabel("Merge into", { exact: true })
    .selectOption(target.id);
  await dialog
    .getByRole("button", { name: "Merge companies", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Beta", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("conversation-row")).toHaveCount(2);
  await page
    .getByTestId("conversation-row")
    .filter({ hasText: "Sep 15, 2026" })
    .getByRole("button", { name: "Edit details", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByLabel("Company", { exact: true }),
  ).toHaveValue("Beta");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const exported = await api(page, "export");
  expect(exported.customers.find((c: any) => c.id === cid).merged_into).toBe(
    target.id,
  );
  expect(exported.documentEdits).toHaveLength(1);
  const report = await api(page, "reports/" + rid);
  expect(report.result.findings[0].quote).toBe(quote);
  const original = await page.request.get(
    "/api/sources/" + report.sources[0].id + "/download",
  );
  expect(await original.text()).toBe(quote);
});

test("signal correction, hiding and restoring persist without an approval queue", async ({
  page,
}) => {
  await signup(page);
  const rid = await analyze(page, "Acme", "2026-10-10");
  const before = (await api(page, "reports/" + rid)).result;
  await page.goto("/signals?view=all");
  await page
    .getByLabel("Actions for Explaining approval changes", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit company or theme", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Company", { exact: true }).fill("Beta");
  await dialog.getByLabel("Theme", { exact: true }).fill("Audit trails");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(page.getByTestId("research-signal")).toContainText(
    "Theme: Audit trails",
  );
  await expect(
    page
      .getByTestId("research-signal")
      .getByRole("link", { name: "Beta", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Actions for Explaining approval changes", { exact: true })
    .click();
  await page.getByRole("button", { name: "Hide signal", exact: true }).click();
  await expect(page.getByTestId("research-signal")).toHaveCount(0);
  await page.getByLabel("Show hidden signals", { exact: true }).check();
  await expect(page).toHaveURL(/hidden=1/);
  await expect(
    page.getByLabel("Show hidden signals", { exact: true }),
  ).toBeChecked();
  await expect(page.getByTestId("research-signal")).toHaveCount(1);
  await page
    .getByLabel("Actions for Explaining approval changes", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restore signal", exact: true })
    .click();
  await expect(page.locator(".research-signal.is-hidden")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("research-signal")).toHaveCount(1);
  expect((await api(page, "reports/" + rid)).result).toEqual(before);
});

test("library reads and corrections enforce ownership, concurrency and validation", async ({
  page,
  browser,
}) => {
  await signup(page);
  const rid = await analyze(page, "Private company", "2026-10-10");
  const company = (await api(page, "library/companies")).items[0];
  const signal = (await api(page, "library/signals?view=all")).items[0];
  const document = (await api(page, "reports/" + rid)).sources[0];
  const ctx = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const other = await ctx.newPage();
    await signup(other);
    for (const path of [
      "library/companies/" + company.id,
      "sources/" + document.id,
      "sources/" + document.id + "/download",
    ])
      expect((await other.request.get("/api/" + path)).status()).toBe(404);
    expect(
      (
        await other.request.patch("/api/library/signals/" + signal.key, {
          data: { version: 0, hidden: true },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await other.request.patch(
          "/api/library/documents/source/" + document.id,
          { data: { version: 0, company_name: "Stolen", meeting_date: null } },
        )
      ).status(),
    ).toBe(404);
    const foreign = (
      await api(other, "customers", {
        name: "Foreign",
        segment: "SMB",
        notes: "",
      })
    ).id;
    expect(
      (
        await page.request.post(
          "/api/library/companies/" + company.id + "/merge",
          { data: { target_id: foreign, version: company.research_version } },
        )
      ).status(),
    ).toBe(404);
    const payload = {
      version: 0,
      company_name: "Private company",
      meeting_date: "2026-09-01",
    };
    await api(
      page,
      "library/documents/source/" + document.id,
      payload,
      "PATCH",
    );
    expect(
      (
        await page.request.patch(
          "/api/library/documents/source/" + document.id,
          { data: { ...payload, company_name: "Should roll back" } },
        )
      ).status(),
    ).toBe(409);
    expect((await api(page, "library/options?q=Should")).items).toHaveLength(0);
    expect(
      (
        await page.request.patch(
          "/api/library/documents/source/" + document.id,
          { data: { ...payload, version: 1, meeting_date: "2026-02-30" } },
        )
      ).status(),
    ).toBe(400);
    await api(
      page,
      "library/signals/" + signal.key,
      { version: 0, hidden: true },
      "PATCH",
    );
    expect(
      (
        await page.request.patch("/api/library/signals/" + signal.key, {
          data: { version: 0, hidden: false },
        })
      ).status(),
    ).toBe(409);
    expect(
      (await page.request.get("/api/library/signals?offset=-1")).status(),
    ).toBe(400);
    expect(
      (
        await page.request.patch("/api/library/companies/" + company.id, {
          headers: { Origin: "https://untrusted.invalid" },
          data: { name: "Forged", version: company.research_version },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await ctx.close();
  }
});

test("all extracted findings are visible even when the report shortlists only one", async ({
  page,
}) => {
  await signup(page);
  const content =
    "Company: Acme\nDate: 2026-10-10\n" +
    quote +
    "\nI would pay for searchable audit history.\nWe do not need detailed audit history for our three-person team.";
  const source = (
    await api(page, "sources", { filename: "Full interview.txt", content })
  ).sources[0];
  const report = await api(page, "reports", {
    sources: [{ id: source.id, role: "customer" }],
  });
  await expect
    .poll(async () => (await api(page, "reports/" + report.id)).job.state, {
      timeout: 60000,
    })
    .toBe("succeeded");
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!,
  );
  if (!process.env.TEST_DATABASE_URL) url.pathname += "_e2e";
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query(
      "UPDATE discovery_reports SET result=jsonb_set(result,'{findings}',jsonb_build_array(result->'findings'->0)) WHERE id=$1",
      [report.id],
    );
    expect((await api(page, "library/signals?view=all")).total).toBe(3);
    const job = randomUUID();
    await db.query(
      "INSERT INTO jobs(id,user_id,report_id,purpose,provider,model,state) SELECT $1,user_id,id,'analyze','openai','fixture','succeeded' FROM discovery_reports WHERE id=$2",
      [job, report.id],
    );
    await db.query(
      "INSERT INTO job_chunks(job_id,chunk_index,source_start,source_end,completed,input,candidates) VALUES($1,0,0,0,true,$2,'[]')",
      [job, JSON.stringify([{ source_id: source.id }])],
    );
    expect((await api(page, "library/signals?view=all")).total).toBe(0);
  } finally {
    await db.end();
  }
});

test("legacy transcripts retain company history, exact quotes and private originals", async ({
  page,
}) => {
  await signup(page);
  const record = await seed(page);
  await manual(page, record.customer, record.transcript);
  await page.goto("/customers/" + record.customer);
  await expect(page.getByTestId("conversation-row")).toHaveCount(1);
  await expect(page.getByTestId("conversation-row")).toContainText(
    "Date not recorded",
  );
  await page
    .getByRole("link", { name: "See all company signals", exact: true })
    .click();
  await expect(page.getByTestId("research-signal")).toHaveCount(1);
  await page
    .getByTestId("research-signal")
    .getByRole("button", { name: /Acme discovery/ })
    .click();
  await expect(page.getByRole("dialog").locator("mark")).toHaveText(quote);
  await expect(
    page
      .getByRole("dialog")
      .getByRole("link", { name: "Download original", exact: true }),
  ).toHaveAttribute(
    "href",
    "/api/transcripts/" + record.transcript + "/download",
  );
});

test("demo company and signal browsing is read only", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Explore demo", exact: true }).click();
  await expect(page.getByLabel("Demo workspace notice")).toContainText(
    "Fictional data",
  );
  await page.goto("/demo/customers");
  await expect(page.getByTestId("company-row")).toHaveCount(8);
  await page.getByTestId("company-row").first().click();
  await expect(
    page.getByRole("button", { name: "Edit details", exact: true }).first(),
  ).toBeDisabled();
  await expect(page.getByLabel("Company actions", { exact: true })).toHaveCount(
    0,
  );
  await page.goto("/demo/signals?view=all");
  await expect(page.getByTestId("research-signal").first()).toBeVisible();
  const data = await (
    await page.request.get("/api/demo/library/signals?view=all")
  ).json();
  expect(
    (
      await page.request.patch(
        "/api/demo/library/signals/" + data.items[0].key,
        { data: { version: 0, hidden: true } },
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post(
        "/api/demo/library/companies/" + data.items[0].company_id + "/merge",
        { data: { target_id: randomUUID(), version: 1 } },
      )
    ).status(),
  ).toBe(403);
});
