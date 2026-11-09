import { test, expect } from "@playwright/test";
import { signup, api, connect } from "./helpers";

test("settings contains billing, account controls, export, and a provider connection", async ({
  page,
}) => {
  await signup(page);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Your account", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Export my data" }),
  ).toHaveAttribute("href", "/api/export");
  await expect(
    page.getByText("Analysis uses your OpenAI connection.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("AI provider", { exact: true })).toHaveValue(
    "openai",
  );
  await expect(page.getByLabel("Model ID", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Validation threshold")).toHaveCount(0);
  await expect(
    page.getByText("Products & modules", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".advanced-settings, .advanced-nav")).toHaveCount(
    0,
  );
  expect(requests.some((url) => /bootstrap|settings\/models/.test(url))).toBe(
    false,
  );
  await page.getByRole("link", { name: "Back to discovery" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Turn customer conversations into product opportunities.",
    }),
  ).toBeVisible();
});

test("saving a connection validates the key and preserves existing model settings", async ({
  page,
}) => {
  await signup(page);
  await connect(page);
  await api(
    page,
    "settings",
    {
      provider: "openai",
      model: "existing-custom-model",
      validation_threshold: 7,
    },
    "PATCH",
  );
  await page.reload();
  await page.getByLabel("Replace API key").fill("invalid-provider-key");
  await page.getByRole("button", { name: "Save connection" }).click();
  await expect(page.locator(".form-error")).toContainText("invalid");
  expect((await api(page, "bootstrap")).settings.has_openai_key).toBe(true);
  await page.getByLabel("Replace API key").fill("test-new-valid-key");
  await page.getByRole("button", { name: "Save connection" }).click();
  await expect(page.getByRole("status")).toHaveText("Connection saved");
  const settings = (await api(page, "flow")).settings;
  expect(settings.model).toBe("existing-custom-model");
  expect(settings.validation_threshold).toBe(7);
  expect(settings).not.toHaveProperty("openai_key");
  expect(JSON.stringify(await api(page, "export"))).not.toContain(
    "test-new-valid-key",
  );
  await page.reload();
  await expect(page.getByLabel("Replace API key")).toHaveValue("");
});

test("switching providers uses a default model and removing a key disables analysis", async ({
  page,
}) => {
  await signup(page);
  await connect(page, "openai");
  await connect(page, "gemini");
  const settings = (await api(page, "flow")).settings;
  expect(settings.model).toBe("gemini-3.1-flash-lite");
  expect(settings.has_openai_key).toBe(true);
  await page.getByRole("button", { name: "Remove saved key" }).click();
  await expect(page.getByText("Not connected", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Connect your own AI provider below.", { exact: false }),
  ).toBeVisible();
  expect((await api(page, "flow")).settings.has_gemini_key).toBe(false);
  await page.getByLabel("AI provider", { exact: true }).selectOption("openai");
  await expect(page.getByText("Connected · key encrypted")).toBeVisible();
});
test("model listing requires the caller's credentials and validates provider and pagination", async ({
  page,
  request,
}) => {
  const anonymous = await request.post("/api/settings/models", {
    data: { provider: "openai", api_key: "test-valid-key" },
  });
  expect(anonymous.status()).toBe(401);
  await signup(page);
  await connect(page);
  const second = await page
    .context()
    .browser()!
    .newContext({ baseURL: new URL(page.url()).origin });
  try {
    const otherPage = await second.newPage();
    await signup(otherPage);
    await api(otherPage, "settings/openai", undefined, "DELETE");
    const missing = await otherPage.request.post("/api/settings/models", {
      data: { provider: "openai" },
    });
    expect(missing.status()).toBe(400);
    expect((await missing.json()).error).toContain("OpenAI API key");
  } finally {
    await second.close();
  }
  const invalid = await page.request.post("/api/settings/models", {
    data: { provider: "untrusted-provider", api_key: "test-valid-key" },
  });
  expect(invalid.status()).toBe(400);
  const loop = await page.request.post("/api/settings/models", {
    data: { provider: "anthropic", api_key: "test-catalog-loop" },
  });
  expect(loop.status()).toBe(502);
  expect((await loop.json()).error).toContain("pagination");
});
