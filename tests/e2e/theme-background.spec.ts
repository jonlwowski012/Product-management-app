import { test, expect } from "@playwright/test";
import { signup, api, seed, manual } from "./helpers";

const quote = "We need audit logs before we can buy.";
const background =
  "A simple project tracker for small teams. No dedicated administrators.";

test("product background persists, exports, and can be overridden or cleared per discovery", async ({
  page,
}) => {
  test.setTimeout(120000);
  await signup(page);
  const connection = (await api(page, "flow")).settings;
  await page.goto("/settings");
  await page.getByLabel("Product background", { exact: true }).fill(background);
  await page
    .getByRole("button", { name: "Save product background", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Product background saved");
  await page.reload();
  await expect(
    page.getByLabel("Product background", { exact: true }),
  ).toHaveValue(background);
  await page.screenshot({
    path: ".local/product-background-settings.png",
    fullPage: true,
  });
  expect((await api(page, "export")).settings.product_context).toBe(background);
  expect((await api(page, "flow")).settings.provider).toBe(connection.provider);
  await page
    .getByRole("link", { name: "Back to discovery", exact: true })
    .click();
  await page
    .locator("summary")
    .filter({ hasText: "Product background" })
    .click();
  await expect(
    page.getByLabel("Product background", { exact: true }),
  ).toHaveValue(background);
  await page
    .getByLabel("Product background", { exact: true })
    .fill("This discovery is about onboarding only.");
  await page.getByLabel("Or paste customer notes").fill(quote);
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  await expect(page.getByTestId("opportunity-card")).toHaveCount(1, {
    timeout: 60000,
  });
  const rid = page.url().split("/").pop()!;
  const report = await api(page, "reports/" + rid);
  expect(report.product_context).toBe(
    "This discovery is about onboarding only.",
  );
  expect((await api(page, "flow")).settings.product_context).toBe(background);
  await api(
    page,
    "settings/product-background",
    { product_context: "Updated product description", previous: background },
    "PATCH",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Add more material", exact: true })
    .click();
  await page
    .locator("summary")
    .filter({ hasText: "Product background" })
    .click();
  await expect(
    page.getByLabel("Product background", { exact: true }),
  ).toHaveValue(report.product_context);
  const source = { id: report.sources[0].id, role: "customer" };
  const inherited = await api(page, "reports", {
    sources: [source],
    parent_id: rid,
  });
  expect((await api(page, "reports/" + inherited.id)).product_context).toBe(
    report.product_context,
  );
  await expect
    .poll(async () => (await api(page, "reports/" + inherited.id)).job.state)
    .toBe("succeeded");
  const defaulted = await api(page, "reports", { sources: [source] });
  expect((await api(page, "reports/" + defaulted.id)).product_context).toBe(
    "Updated product description",
  );
  await expect
    .poll(async () => (await api(page, "reports/" + defaulted.id)).job.state)
    .toBe("succeeded");
  await page.goto("/?new=1");
  await page
    .locator("summary")
    .filter({ hasText: "Product background" })
    .click();
  await page.getByLabel("Product background", { exact: true }).fill("");
  await page.getByLabel("Or paste customer notes").fill(quote);
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  await expect(page.getByTestId("opportunity-card")).toHaveCount(1, {
    timeout: 60000,
  });
  expect(
    (await api(page, "reports/" + page.url().split("/").pop())).product_context,
  ).toBe("");
  expect((await api(page, "flow")).settings.product_context).toBe(
    "Updated product description",
  );
});

test("explore a theme selects its full sources, opposing views and legacy notes, preserving customer filters", async ({
  page,
}) => {
  test.setTimeout(120000);
  await signup(page);
  const sources: { id: string }[] = [];
  for (const [name, content] of [
    ["Acme.txt", "Company: Acme\n" + quote],
    [
      "Beta.txt",
      "Company: Beta\nWe do not need detailed audit history for our three-person team.",
    ],
    ["Hidden.txt", "Company: Hidden\n" + quote],
  ])
    sources.push(
      (await api(page, "sources", { filename: name, content })).sources[0],
    );
  const created = await api(page, "reports", {
    sources: sources.map((s) => ({ id: s.id, role: "customer" })),
  });
  await page.goto("/reports/" + created.id);
  await expect(page.getByTestId("opportunity-card")).toHaveCount(1, {
    timeout: 60000,
  });
  const signals = (await api(page, "library/signals?view=all")).items;
  const theme = signals.find((s: any) => s.source_id === sources[0].id).theme;
  const hidden = signals.find((s: any) => s.source_id === sources[2].id);
  await api(
    page,
    "library/signals/" + hidden.key,
    { version: hidden.version, hidden: true },
    "PATCH",
  );
  const legacy = await seed(
    page,
    "[00:12] Customer: " + quote + "\nLegacy interview",
  );
  await manual(page, legacy.customer, legacy.transcript, { title: theme });
  const unrelated = await seed(
    page,
    "[00:12] Customer: " + quote + "\nUnrelated interview",
  );
  await manual(page, unrelated.customer, unrelated.transcript, {
    title: "Unrelated feedback",
  });
  await api(
    page,
    "settings/product-background",
    { product_context: background, previous: "" },
    "PATCH",
  );
  const before = (await api(page, "flow")).reports.length;
  await page.goto("/signals");
  await page
    .getByTestId("theme-card")
    .filter({ has: page.getByRole("heading", { name: theme, exact: true }) })
    .click();
  await page
    .getByRole("link", { name: "Explore this theme", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Included sources" }),
  ).toContainText("Included sources (3)");
  await expect(page.getByLabel("What are you trying to learn?")).toHaveCount(0);
  await expect(page.locator(".flow-input")).toContainText(
    `Sources for ${theme} are selected below.`,
  );
  const included = page.getByRole("region", { name: "Included sources" });
  await expect(included).toContainText("Acme.txt");
  await expect(included).toContainText("Beta.txt");
  await expect(included).not.toContainText("Hidden.txt");
  expect((await api(page, "flow")).reports.length).toBe(before);
  await page
    .locator("summary")
    .filter({ hasText: "Product background" })
    .click();
  await expect(
    page.getByLabel("Product background", { exact: true }),
  ).toHaveValue(background);
  const prepared = await api(page, "library/explore", { theme });
  expect(new Set(prepared.sources.map((s: any) => s.id)).size).toBe(3);
  const acme = (await api(page, "library/options?q=Acme")).items.find(
    (c: any) => c.id !== legacy.customer && c.id !== unrelated.customer,
  );
  const scoped = await api(page, "library/explore", {
    theme,
    company: acme.id,
  });
  expect(scoped.sources.map((s: any) => s.id)).toEqual([sources[0].id]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/theme-discovery-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page
    .getByRole("button", { name: "Remove saved Beta.txt", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  await expect(page.getByTestId("opportunity-card")).toHaveCount(1, {
    timeout: 60000,
  });
  const report = await api(page, "reports/" + page.url().split("/").pop());
  expect(report.sources).toHaveLength(2);
  expect(report.question).toBe(`What should we learn next about ${theme}?`);
  expect(report.sources.some((s: any) => s.id === sources[1].id)).toBe(false);
  await page.goto(
    "/signals?view=all&theme=" +
      encodeURIComponent(theme) +
      "&company=" +
      acme.id,
  );
  await page
    .getByRole("link", { name: "Explore this theme", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Included sources" }),
  ).toContainText("Included sources (1)");
});

test("background validation, stale saves, theme failures and read-only demo boundaries", async ({
  page,
  request,
}) => {
  expect(
    (
      await request.post("/api/library/explore", {
        data: { theme: "Private theme" },
      })
    ).status(),
  ).toBe(401);
  await signup(page);
  await api(
    page,
    "settings/product-background",
    { product_context: background, previous: "" },
    "PATCH",
  );
  expect(
    (
      await page.request.patch("/api/settings/product-background", {
        data: { product_context: "stale change", previous: "" },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.patch("/api/settings/product-background", {
        data: { product_context: "x".repeat(3001), previous: background },
      })
    ).status(),
  ).toBe(400);
  const legacy = await seed(page);
  await manual(page, legacy.customer, legacy.transcript, {
    title: "Private feedback",
  });
  const context = await page
    .context()
    .browser()!
    .newContext({ baseURL: new URL(page.url()).origin });
  try {
    const other = await context.newPage();
    await signup(other);
    expect((await api(other, "flow")).settings.product_context).toBe("");
    expect(
      (
        await other.request.post("/api/library/explore", {
          data: { theme: "Private feedback" },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await other.request.post("/api/library/explore", {
          data: { theme: "Private feedback", company: legacy.customer },
        })
      ).status(),
    ).toBe(404);
  } finally {
    await context.close();
  }
  expect(
    (
      await page.request.post("/api/library/explore", {
        data: { theme: "Missing theme" },
      })
    ).status(),
  ).toBe(404);
  await page.goto("/?new=1&theme=Missing%20theme");
  await expect(page.locator("p[role=alert]")).toContainText(
    "no visible source material",
  );
  await expect(
    page.getByRole("button", { name: "Find opportunities", exact: true }),
  ).toHaveCount(0);
  await page.goto("/demo");
  await page.getByRole("button", { name: "Explore demo", exact: true }).click();
  await expect(page.getByTestId("opportunity-card")).toHaveCount(3);
  expect(
    (
      await page.request.post("/api/demo/library/explore", {
        data: { theme: "Anything" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.patch("/api/demo/settings/product-background", {
        data: { product_context: "Changed", previous: "" },
      })
    ).status(),
  ).toBe(403);
  await page.goto("/demo/settings");
  await expect(
    page.getByLabel("Product background", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Save product background", exact: true }),
  ).toHaveCount(0);
});
