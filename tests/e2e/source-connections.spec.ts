import { test, expect } from "@playwright/test";
import { api, signup } from "./helpers";

test("connected apps share one picker and imported notes join saved material", async ({
  page,
}) => {
  const denied = await page.request.post("/api/source-connections", {
    data: { provider: "granola", action: "browse" },
  });
  expect(denied.status()).toBe(401);
  await signup(page);
  await page.route("**/api/flow", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: {
        ...(await response.json()),
        sourceProviders: ["onedrive", "confluence", "google-drive", "granola"],
      },
    });
  });
  const actions: string[] = [];
  await page.route("**/api/source-connections", async (route) => {
    const { action, provider, transcript } = route.request().postDataJSON();
    actions.push(action);
    expect(provider).toBe("granola");
    if (action === "browse") {
      await route.fulfill({
        json: { items: [{ id: "granola-test", title: "Research notes" }] },
      });
      return;
    }
    expect(action).toBe("import");
    expect(transcript).toBe(false);
    const saved = await api(page, "sources", {
      filename: "Research notes.txt",
      content: "We are investigating onboarding improvements.",
    });
    await route.fulfill({
      json: { source: { ...saved.sources[0], role: "context" } },
    });
  });
  await page.goto("/?new=1");
  await page
    .getByRole("button", { name: "Import from connected apps" })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Import from connected apps",
  });
  await expect(dialog.getByRole("option")).toHaveText([
    "OneDrive",
    "Confluence",
    "Google Drive",
    "Granola",
  ]);
  await dialog.getByLabel("Source app").selectOption("granola");
  await dialog.getByRole("button", { name: "Browse recent meetings" }).click();
  await expect(
    dialog.getByRole("button", { name: "Import transcript Research notes" }),
  ).toBeVisible();
  expect(actions).toEqual(["browse"]);
  await dialog
    .getByRole("button", { name: "Import notes Research notes" })
    .click();
  await expect(dialog.getByRole("status")).toHaveText(
    "Added to your saved material.",
  );
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByLabel("Source type for saved Research notes.txt"),
  ).toHaveValue("context");
  expect(actions).toEqual(["browse", "import"]);
});
