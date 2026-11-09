import { test, expect } from "@playwright/test";
import { signup, api } from "./helpers";
test("501-file progress is readable on desktop and mobile and cancellation preserves saved work", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signup(page);
  await page.route("http://127.0.0.1:3102/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await route.continue().catch(() => {});
  });
  await page.getByLabel("Discovery files", { exact: true }).setInputFiles(
    Array.from({ length: 501 }, (_, i) => ({
      name: `Customer ${i} — Discovery call.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from(
        `Customer ${i}: We need audit logs before we can buy.`,
      ),
    })),
  );
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  const progress = page.getByRole("progressbar", {
    name: "Import progress",
    exact: true,
  });
  await expect(progress).toBeInViewport();
  await expect
    .poll(async () => Number(await progress.getAttribute("value")))
    .toBeGreaterThan(0);
  await page.screenshot({ path: ".local/bulk-import-progress-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Import status")).toContainText(
    "of 501 files processed",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await expect(progress).toBeInViewport();
  await page.screenshot({ path: ".local/bulk-import-progress-mobile.png" });
  await page
    .getByRole("button", { name: "Cancel import", exact: true })
    .click();
  await expect(page.getByLabel("Import warnings")).toContainText(
    "Import cancelled",
  );
  const metadata = await api(page, "flow");
  expect(metadata.sources.length).toBeGreaterThan(0);
  expect(metadata.reports).toHaveLength(0);
});
