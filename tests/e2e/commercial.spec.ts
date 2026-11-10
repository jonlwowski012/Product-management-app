import { AGREEMENT_VERSION } from "../../lib/user-agreement";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { signup, api, testDatabase } from "./helpers";

test("payment expiry blocks new tokens and an interrupted deletion remains retryable", async ({
  page,
}) => {
  await signup(page);
  const owner = (await api(page, "flow")).user.id;
  const {
    reservations: [upload],
  } = await api(page, "uploads/reserve", {
    discovery: true,
    files: [{ name: "late.txt", size: 10 }],
  });
  const db = testDatabase();
  await db.connect();
  const tokenRequest = {
    type: "blob.generate-client-token",
    payload: {
      pathname: upload.pathname,
      clientPayload: upload.id,
      multipart: false,
    },
  };
  try {
    await db.query(
      "UPDATE subscriptions SET paid_until=now()-interval '1 second' WHERE user_id=$1",
      [owner],
    );
    expect(
      (
        await page.request.post("/api/uploads/token", { data: tokenRequest })
      ).ok(),
    ).toBe(false);
    await db.query("UPDATE users SET deletion_requested_at=now() WHERE id=$1", [
      owner,
    ]);
    expect(
      (
        await page.request.post("/api/uploads/token", { data: tokenRequest })
      ).ok(),
    ).toBe(false);
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "Account deletion in progress" }),
    ).toBeVisible();
    expect((await page.request.get("/api/export")).status()).toBe(403);
    await page
      .getByLabel("Password to delete account")
      .fill("a-secure-test-password");
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await page.getByRole("button", { name: "Retry account deletion" }).click();
    await expect(
      page.getByRole("button", { name: "Create account", exact: true }),
    ).toBeVisible();
    const {
      rows: [cleanup],
    } = await db.query(
      "SELECT not_before>now()+interval '1 hour' AS deferred FROM storage_deletions WHERE pathname=$1",
      ["blob:" + upload.pathname],
    );
    expect(cleanup.deferred).toBe(true);
  } finally {
    await db.end();
  }
});

test("new unpaid accounts can connect keys but cannot upload or use legacy writes", async ({
  page,
}) => {
  await page.context().setExtraHTTPHeaders({
    "x-real-ip": "2001:db8::" + randomUUID().replaceAll("-", "").slice(0, 4),
  });
  await page.goto("/");
  const registered = await page.request.post("/api/auth/register", {
    data: {
      email: randomUUID() + "@example.com",
      name: "New owner",
      agreement_accepted: true,
      agreement_version: AGREEMENT_VERSION,
      password: "a-secure-test-password",
    },
  });
  expect(registered.ok()).toBeTruthy();
  const before = await api(page, "flow");
  expect(before.billing.active).toBe(false);
  expect(before.hasOwnKey).toBe(false);
  await api(
    page,
    "settings",
    {
      provider: "openai",
      model: "gpt-4.1-mini",
      validation_threshold: 3,
      api_key: "test-valid-key",
    },
    "PATCH",
  );
  const connected = await api(page, "flow");
  expect(connected.hasOwnKey).toBe(true);
  expect(connected.analysisReady).toBe(false);
  for (const [route, data] of [
    ["sources", { content: "Private customer notes" }],
    ["customers", { name: "Customer", segment: "", notes: "" }],
    ["reports", { sources: [] }],
  ] as const) {
    expect((await page.request.post("/api/" + route, { data })).status()).toBe(
      402,
    );
  }
  expect((await api(page, "flow")).sources).toHaveLength(0);
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Subscription", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Subscribe for $10/month", exact: true }),
  ).toBeVisible();
});

test("password changes revoke every session and require the current password", async ({
  page,
  browser,
}) => {
  const email = await signup(page);
  const second = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  try {
    const signedIn = await second.request.post("/api/auth/login", {
      data: { email, password: "a-secure-test-password" },
    });
    expect(signedIn.ok()).toBeTruthy();
    const wrong = await page.request.post("/api/account/password", {
      data: {
        current_password: "wrong-password",
        password: "new-secure-test-password",
      },
    });
    expect(wrong.status()).toBe(403);
    await page.goto("/settings");
    await page
      .getByLabel("Current password", { exact: true })
      .fill("a-secure-test-password");
    await page
      .getByLabel("New password", { exact: true })
      .fill("new-secure-test-password");
    await page
      .getByRole("button", { name: "Change password and sign out everywhere" })
      .click();
    await expect(
      page.getByRole("button", { name: "Create account", exact: true }),
    ).toBeVisible();
    expect((await second.request.get("/api/flow")).status()).toBe(401);
    expect(
      (
        await page.request.post("/api/auth/login", {
          data: { email, password: "a-secure-test-password" },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await page.request.post("/api/auth/login", {
          data: { email, password: "new-secure-test-password" },
        })
      ).ok(),
    ).toBeTruthy();
  } finally {
    await second.close();
  }
});

test("account deletion requires explicit confirmation and removes access to saved sources", async ({
  page,
}) => {
  await signup(page);
  const source = await api(page, "sources", {
    filename: "Private notes.txt",
    content: "The customer needs an audit trail.",
  });
  const rejected = await page.request.post("/api/account/delete", {
    data: { password: "a-secure-test-password", confirmation: "" },
  });
  expect(rejected.status()).toBe(400);
  expect(
    (await page.request.get("/api/sources/" + source.sources[0].id)).ok(),
  ).toBeTruthy();
  await page.goto("/settings");
  await page
    .getByLabel("Password to delete account")
    .fill("a-secure-test-password");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page
    .getByRole("button", { name: "Permanently delete account" })
    .click();
  await expect(
    page.getByRole("button", { name: "Create account", exact: true }),
  ).toBeVisible();
  expect(
    (await page.request.get("/api/sources/" + source.sources[0].id)).status(),
  ).toBe(401);
});

test("pricing and setup are public and explain separate AI charges", async ({
  page,
}) => {
  await page.goto("/pricing");
  await expect(
    page.getByRole("heading", { name: "One plan. $10/month." }),
  ).toBeVisible();
  await expect(
    page.getByText("Your provider bills AI usage separately.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Setup guide", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Get started with Evidence" }),
  ).toBeVisible();
});
