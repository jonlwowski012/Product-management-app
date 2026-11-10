import { test, expect } from "@playwright/test";
import { signup, connect } from "./helpers";

test("settings and demo fit mobile without an advanced navigation menu", async ({
  page,
}) => {
  await signup(page);
  await connect(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await expect(page.getByLabel("Model ID", { exact: true })).toHaveCount(0);
  await page.goto("/demo");
  await page.getByRole("button", { name: "Explore demo", exact: true }).click();
  await expect(page.getByLabel("Demo workspace notice")).toContainText(
    "Fictional data",
  );
  await expect(page.getByTestId("opportunity-card")).toHaveCount(3);
  await page.goto("/demo/settings");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save connection" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("simple discovery workflow, report, history, and source passage fit mobile", async ({
  page,
}) => {
  await signup(page);
  await page
    .getByLabel("Or paste customer notes")
    .fill("We need audit logs before we can buy.");
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your discovery opportunities",
      exact: true,
    }),
  ).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId("opportunity-card")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page
    .getByTestId("opportunity-card")
    .locator(".flow-evidence>summary")
    .click();
  await page
    .locator(".flow-evidence")
    .getByRole("button", { name: /Customer notes.txt · Original text/ })
    .click();
  await expect(page.getByRole("dialog").locator("mark")).toHaveText(
    "We need audit logs before we can buy.",
  );
  expect(
    await page
      .getByRole("dialog")
      .evaluate((e) => e.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Choose this opportunity", exact: true })
    .click();
  await page.getByLabel("Validation status").selectOption("testing");
  await page
    .getByLabel("What will you do?")
    .fill("Interview the owner about retention.");
  await page.getByRole("button", { name: "Save validation work" }).click();
  await expect(page.locator(".flow-validation summary")).toContainText(
    "Testing",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/simple-report-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Add more material", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "What have you learned since?" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("customer and signal workflows fit mobile and keep source quotes accessible", async ({
  page,
}) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Explore demo", exact: true }).click();
  await expect(page.getByLabel("Demo workspace notice")).toContainText(
    "Fictional data",
  );
  for (const route of [
    "/demo/customers",
    "/demo/signals",
    "/demo/signals?view=all",
  ]) {
    await page.goto(route);
    await expect(page.locator(".research-page")).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      route,
    ).toBe(true);
  }
  await page.screenshot({
    path: ".local/research-signals-mobile.png",
    fullPage: false,
  });
  await page
    .getByTestId("research-signal")
    .first()
    .getByRole("button")
    .first()
    .click();
  await expect(page.getByRole("dialog").locator("mark")).toBeVisible();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((e) => e.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(390);
});
