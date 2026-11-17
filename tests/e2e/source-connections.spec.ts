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
  await page.addInitScript(() => {
    class PickerBuilder {
      private callback: ((data: { action: string }) => void) | undefined;
      addView() {
        return this;
      }
      setAppId() {
        return this;
      }
      setOrigin() {
        return this;
      }
      setDeveloperKey() {
        return this;
      }
      setOAuthToken() {
        return this;
      }
      setCallback(callback: (data: { action: string }) => void) {
        this.callback = callback;
        return this;
      }
      build() {
        return {
          setVisible: (visible: boolean) => {
            if (visible)
              window.setTimeout(() => this.callback?.({ action: "error" }), 20);
          },
        };
      }
    }
    class DocsView {
      setEnableDrives() {
        return this;
      }
      setMode() {
        return this;
      }
    }
    Object.assign(window, {
      google: {
        picker: { PickerBuilder, DocsView, DocsViewMode: { LIST: "list" } },
      },
    });
  });
  const actions: string[] = [];
  await page.route("**/api/source-connections", async (route) => {
    const { action, provider, transcript } = route.request().postDataJSON();
    if (provider === "google-drive" && action === "browse") {
      await route.fulfill({
        json: { picker: { token: "test", key: "test", appId: "test" } },
      });
      return;
    }
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
  const settings = await page.goto("/settings");
  if (
    process.env.SOURCE_CONNECT_GOOGLE_DRIVE &&
    process.env.VERCEL_OIDC_TOKEN
  ) {
    expect(settings?.headers()["content-security-policy"]).toContain(
      "frame-src https://docs.google.com",
    );
    expect(settings?.headers()["content-security-policy"]).toContain(
      "https://apis.google.com",
    );
    const nested = await page.request.get("/settings/old?new=1");
    expect(nested.headers()["content-security-policy"]).toContain(
      "https://apis.google.com",
    );
  }
  await page.getByRole("link", { name: "Discovery", exact: true }).click();
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
  await dialog.getByLabel("Source app").selectOption("google-drive");
  await dialog.getByRole("button", { name: "Choose a file" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Google Picker could not open Drive. Try again.",
  );
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
  const role = page.getByLabel("Source type for saved Research notes.txt");
  await role.selectOption("auto");
  await page
    .getByRole("button", { name: "Import from connected apps" })
    .click();
  await dialog.getByLabel("Source app").selectOption("granola");
  await dialog.getByRole("button", { name: "Browse recent meetings" }).click();
  await dialog
    .getByRole("button", { name: "Import notes Research notes" })
    .click();
  await expect(dialog.getByRole("status")).toHaveText(
    "Reused a matching saved source.",
  );
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(role).toHaveValue("auto");
  expect(actions).toEqual(["browse", "import", "browse", "import"]);
});
