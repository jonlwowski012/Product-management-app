import { test, expect } from "@playwright/test";

for (const width of [1280, 390]) {
  test(`homepage explains the product and preserves entry points at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "build next?",
    );
    await expect(page.getByRole("figure")).toContainText("Fictional example");
    await expect(page.getByRole("figure")).toContainText("Direct challenge");
    await expect(page.getByRole("figure")).toContainText("WHAT TO TRY NEXT");
    await expect(page.locator("#pricing")).toContainText(
      "Your provider bills AI usage separately",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);

    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Sign in" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Welcome back." }),
    ).toBeInViewport();
    await expect(page.getByLabel("Your name")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page.getByLabel("Your name")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create account", exact: true }),
    ).toBeVisible();
    await page.goto("/");
    await page.screenshot({
      path: `.local/homepage-${width}.png`,
      fullPage: width === 390,
      style: "nextjs-portal { display: none; }",
    });
    await page
      .getByRole("button", { name: "Explore demo", exact: true })
      .click();
    await expect(page.getByTestId("opportunity-card")).toHaveCount(3);
  });
}

test("signup from the homepage opens the workspace at the top", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Start your own workspace" }).click();
  await page.getByLabel("Your name").fill("Homepage Tester");
  await page
    .getByLabel("Email address")
    .fill(`homepage-${crypto.randomUUID()}@example.com`);
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
  ).toBeInViewport();
  await expect(page.locator(".marketing-home")).toHaveCount(0);
});
