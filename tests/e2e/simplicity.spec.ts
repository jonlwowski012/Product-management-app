import { test, expect } from "@playwright/test";
import { signup, api } from "./helpers";

test("advanced deep links return to the core flow and saved records survive", async ({
  page,
}) => {
  await signup(page);
  const customer = await api(page, "customers", {
    name: "Existing customer",
    segment: "SMB",
    notes: "Keep this record",
  });
  for (const path of [
    "/transcripts/old-source",
    "/features",
    "/briefs",
    "/executive",
    "/discovery",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", {
        name: "Turn customer conversations into product opportunities.",
      }),
    ).toBeVisible();
    await expect(page.locator(".advanced-nav, .sidebar")).toHaveCount(0);
  }
  await expect(page.getByLabel("Product context", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("Saved sources", { exact: true })).toHaveCount(0);
  expect(
    (await api(page, "export")).customers.find((c: any) => c.id === customer.id)
      .notes,
  ).toBe("Keep this record");
});

test("updating a report includes its sources and allows removing one", async ({
  page,
}) => {
  await signup(page);
  await page
    .getByLabel("Or paste customer notes")
    .fill("We need audit logs before we can buy.");
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  await expect(page.getByTestId("opportunity-card")).toHaveCount(1, {
    timeout: 60000,
  });
  const first = page.url().split("/").pop();
  await page
    .getByRole("button", { name: "Add more material", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Included sources" }),
  ).toContainText("Customer notes.txt");
  await page
    .getByRole("button", {
      name: "Remove saved Customer notes.txt",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("region", { name: "Included sources" }),
  ).toHaveCount(0);
  await page
    .getByLabel("Or paste customer notes")
    .fill("I would pay for searchable audit history.");
  await page.getByRole("button", { name: "Update opportunities" }).click();
  await expect(page).not.toHaveURL(new RegExp(first + "$"));
  await expect(page.getByTestId("opportunity-card")).toHaveCount(1, {
    timeout: 60000,
  });
  const report = await api(page, "reports/" + page.url().split("/").pop());
  expect(report.sources).toHaveLength(1);
  expect(report.result.findings[0].quote).toContain("I would pay");
  expect((await api(page, "reports/" + first)).sources).toHaveLength(1);
});

test("reused documents can still be marked as company context", async ({
  page,
}) => {
  await signup(page);
  const content = "Our internal roadmap says audit logs are important.";
  await api(page, "sources", { filename: "Strategy.txt", content });
  await page.reload();
  await page.getByLabel("Discovery files", { exact: true }).setInputFiles({
    name: "Strategy.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(content),
  });
  await page
    .getByLabel("Source type for saved Strategy.txt", { exact: true })
    .selectOption("context");
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "More customer evidence is needed",
      exact: true,
    }),
  ).toBeVisible({ timeout: 60000 });
  const report = await api(page, "reports/" + page.url().split("/").pop());
  expect(report.sources[0].role).toBe("context");
  expect(report.result.opportunities).toHaveLength(0);
});
