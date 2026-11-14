import { test, expect, type Page } from "@playwright/test";
import { signup, api, testDatabase } from "./helpers";

async function ready(page: Page) {
  await expect(page).toHaveURL(/\/reports\/[a-f0-9-]+$/);
  await expect(
    page.getByRole("heading", {
      name: "Your discovery opportunities",
      exact: true,
    }),
  ).toBeVisible({ timeout: 60000 });
  return api(page, "reports/" + page.url().split("/").at(-1));
}

test("upload once, reuse saved transcripts and analyze only newly added material", async ({
  page,
}) => {
  await signup(page);
  await page.getByLabel("Discovery files", { exact: true }).setInputFiles({
    name: "Acme call.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("We need audit logs before we can buy."),
  });
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  const first = await ready(page);
  await page.goto("/?new=1");
  await expect(
    page.getByRole("region", { name: "Included sources" }),
  ).toContainText("Acme call.txt");
  let uploads = 0;
  page.on("request", (req) => {
    if (
      req.method() === "POST" &&
      /\/api\/(uploads\/reserve|sources)$/.test(req.url())
    )
      uploads++;
  });
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  expect((await ready(page)).id).toBe(first.id);
  expect(uploads).toBe(0);
  await page.goto("/?new=1");
  await page
    .getByLabel("Or paste customer notes")
    .fill("I would pay for searchable audit history.");
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  const next = await ready(page);
  expect(next.sources).toHaveLength(2);
  expect(next.sources.map((s: any) => s.id)).toContain(first.sources[0].id);
  expect(uploads).toBe(1);
  const db = testDatabase();
  await db.connect();
  try {
    const { rows: chunks } = await db.query(
      "SELECT c.input FROM job_chunks c JOIN jobs j ON j.id=c.job_id WHERE j.report_id=$1",
      [next.id],
    );
    expect(chunks.length).toBeGreaterThan(0);
    expect(
      chunks
        .flatMap((c: any) => c.input)
        .every((p: any) => p.source_id !== first.sources[0].id),
    ).toBe(true);
  } finally {
    await db.end();
  }
  await page.goto("/signals");
  await expect(page.getByTestId("theme-card")).toHaveCount(1);
  await expect(page.getByTestId("theme-card")).toContainText("2 signals");
});

test("saved material can be searched and reselected with its context label intact", async ({
  page,
}) => {
  await signup(page);
  const source = (
    await api(page, "sources", {
      filename: "Strategy.txt",
      content: "Our internal roadmap says audit logs are important.",
    })
  ).sources[0];
  await api(page, "reports", { sources: [{ id: source.id, role: "context" }] });
  await page.goto("/?new=1");
  await expect(
    page.getByLabel("Source type for saved Strategy.txt", { exact: true }),
  ).toHaveValue("context");
  await page
    .getByRole("button", { name: "Remove saved Strategy.txt", exact: true })
    .click();
  await page
    .getByText("Choose from saved material (1)", { exact: true })
    .click();
  await page.getByLabel("Search saved material").fill("missing");
  await expect(page.getByText("No matching saved documents.")).toBeVisible();
  await page.getByLabel("Search saved material").fill("strategy");
  await page
    .getByRole("checkbox", { name: "Strategy.txt", exact: true })
    .check();
  await expect(
    page.getByLabel("Source type for saved Strategy.txt", { exact: true }),
  ).toHaveValue("context");
  expect((await api(page, "sources?q=Strategy")).sources[0].role).toBe(
    "context",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".local/saved-material.png", fullPage: true });
});

test("large libraries require an explicit selection and all pages remain available privately", async ({
  page,
  browser,
}) => {
  const email = await signup(page);
  const db = testDatabase();
  await db.connect();
  try {
    await db.query(
      `INSERT INTO discovery_sources(id,user_id,filename,sha256,pages) SELECT gen_random_uuid(),u.id,'Call ' || n || '.txt',md5(n::text),'[{"label":"Page 1","text":"Customer needs audit logs."}]'::jsonb FROM users u CROSS JOIN generate_series(1,5001) n WHERE u.email=$1`,
      [email],
    );
  } finally {
    await db.end();
  }
  await page.goto("/?new=1");
  await expect(
    page.getByText(/Choose up to 1,000 saved documents/),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Included sources" }),
  ).toHaveCount(0);
  await page
    .getByText("Choose from saved material (5,001)", { exact: true })
    .click();
  await expect(page.getByRole("checkbox")).toHaveCount(50);
  await page.getByRole("button", { name: "Next saved documents" }).click();
  await expect(
    page.getByRole("button", { name: "Previous saved documents" }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(50);
  const all = await api(page, "sources?offset=5000");
  expect(all.sources).toHaveLength(1);
  expect(all.next).toBeNull();
  expect(all.total).toBe(5001);
  expect((await page.request.get("/api/sources?offset=-1")).status()).toBe(400);
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await signup(other);
    expect((await api(other, "sources")).total).toBe(0);
  } finally {
    await context.close();
  }
});
