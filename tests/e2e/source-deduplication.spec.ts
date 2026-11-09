import { test, expect, type Page } from "@playwright/test";
import { signup, api } from "./helpers";
const quote = "We need audit logs before we can buy.";
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
test("identical files are removed before upload while same-named edited documents remain", async ({
  page,
}) => {
  await signup(page);
  let reservations = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/uploads/reserve")) reservations++;
  });
  await page.getByLabel("Discovery files", { exact: true }).setInputFiles([
    { name: "call.txt", mimeType: "text/plain", buffer: Buffer.from(quote) },
    {
      name: "renamed-copy.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(quote),
    },
    {
      name: "call.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(quote + " Updated customer feedback."),
    },
  ]);
  await expect(page.locator(".flow-files .flow-file")).toHaveCount(2);
  await expect(page.getByLabel("Import warnings")).toContainText(
    "Skipped duplicate renamed-copy.txt",
  );
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  const report = await ready(page);
  expect(reservations).toBe(2);
  expect(report.sources).toHaveLength(2);
  expect((await api(page, "flow")).sources).toHaveLength(2);
  await expect(page.getByLabel("Import warnings")).toContainText(
    "renamed-copy.txt",
  );
});
test("re-importing a saved file reuses its source without uploading or changing historical citations", async ({
  page,
}) => {
  await signup(page);
  const source = (
    await api(page, "sources", { filename: "original.txt", content: quote })
  ).sources[0];
  const initial = await api(page, "reports", {
    sources: [{ id: source.id, role: "auto" }],
  });
  await page.goto("/reports/" + initial.id);
  const before = await ready(page);
  await page.goto("/?new=1");
  let reservations = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/uploads/reserve")) reservations++;
  });
  await page.getByLabel("Discovery files", { exact: true }).setInputFiles({
    name: "renamed-copy.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(quote),
  });
  await expect(page.getByLabel("Import warnings")).toContainText(
    "Reused saved source original.txt",
  );
  await expect(page.locator(".flow-files .flow-file")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Included sources (1)" }),
  ).toContainText("Included sources (1)");
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  const after = await ready(page);
  expect(reservations).toBe(0);
  expect(after.id).toBe(initial.id);
  expect(after.result).toEqual(before.result);
  expect((await api(page, "flow")).sources).toHaveLength(1);
  expect(
    await (
      await page.request.get("/api/sources/" + source.id + "/download")
    ).text(),
  ).toBe(quote);
  await page.screenshot({ path: ".local/source-dedupe/reused-source.png" });
});
test("duplicate source selections are counted once and context classification takes precedence", async ({
  page,
}) => {
  await signup(page);
  const source = (
    await api(page, "sources", { filename: "notes.txt", content: quote })
  ).sources[0];
  const report = await api(page, "reports", {
    sources: [
      { id: source.id, role: "customer" },
      { id: source.id, role: "context" },
    ],
  });
  await page.goto("/reports/" + report.id);
  const result = await ready(page);
  expect(result.sources).toHaveLength(1);
  expect(result.sources[0].role).toBe("context");
  expect(result.result.opportunities).toHaveLength(0);
  expect(result.import_warnings.join(" ")).toContain(
    "Conflicting source types",
  );
});
test("matching content in different accounts remains private and is not merged across users", async ({
  page,
  browser,
}) => {
  await signup(page);
  const first = (
    await api(page, "sources", { filename: "first.txt", content: quote })
  ).sources[0];
  const context = await browser.newContext();
  const other = await context.newPage();
  try {
    await signup(other);
    await other.getByLabel("Discovery files", { exact: true }).setInputFiles({
      name: "copy.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(quote),
    });
    await expect(other.locator(".flow-files .flow-file")).toHaveCount(1);
    await other
      .getByRole("button", { name: "Find opportunities", exact: true })
      .click();
    const report = await ready(other);
    expect(report.sources[0].id).not.toBe(first.id);
    expect((await other.request.get("/api/sources/" + first.id)).status()).toBe(
      404,
    );
  } finally {
    await context.close();
  }
});
