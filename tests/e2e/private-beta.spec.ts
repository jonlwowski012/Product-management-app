import { test, expect } from "@playwright/test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "../../lib/crypto";
import { AGREEMENT_VERSION } from "../../lib/user-agreement";
import { api, testDatabase } from "./helpers";

test.describe.configure({ mode: "serial" });

test.skip(
  process.env.BETA_MODE !== "true",
  "Run against the isolated beta configuration",
);

test("an invitation grants one tester access without a subscription or checkout", async ({
  page,
}) => {
  const token = randomBytes(32).toString("base64url");
  await page.goto("/");
  const db = testDatabase();
  await db.connect();
  try {
    await db.query("TRUNCATE beta_invitations");
    await db.query(
      "INSERT INTO beta_invitations(slot,token_hash) VALUES(1,$1)",
      [createHash("sha256").update(token).digest("hex")],
    );
    const input = {
      email: randomUUID() + "@example.com",
      password: "beta-test-password-123",
      agreement_accepted: true,
      agreement_version: AGREEMENT_VERSION,
    };
    const register = (invitation?: string) =>
      page.request.post("/api/auth/register", {
        data: { ...input, email: randomUUID() + "@example.com", invitation },
      });
    expect((await register()).status()).toBe(403);
    await page.goto("/#invite=" + token);
    await page.reload();
    await page.getByLabel("Your name").fill("Beta Tester");
    await page.getByLabel("Email address").fill(input.email);
    await page.getByLabel("Password", { exact: true }).fill(input.password);
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
    ).toBeVisible();
    expect((await api(page, "flow")).billing).toMatchObject({
      active: true,
      beta: true,
      paymentsEnabled: false,
      paidUntil: null,
    });
    const imported = await api(page, "sources", {
      filename: "Beta feedback.txt",
      content: "We need audit logs before we can buy.",
    });
    expect(imported.sources).toHaveLength(1);
    expect((await register(token)).status()).toBe(403);
    for (const path of ["checkout", "portal"]) {
      expect(
        (
          await page.request.post("/api/billing/" + path, { data: {} })
        ).status(),
      ).toBe(403);
    }
    await page.goto("/settings");
    await expect(
      page.getByText("Your complimentary beta access is active.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /subscribe/i })).toHaveCount(
      0,
    );
    await expect(
      db.query(
        "INSERT INTO beta_invitations(slot,token_hash) VALUES(11,'invalid')",
      ),
    ).rejects.toThrow();
  } finally {
    await db.end();
  }
});

test("only the configured account can create and revoke beta invites", async ({
  page,
  browser,
}) => {
  const adminId = process.env.BETA_ADMIN_USER_ID;
  test.skip(!adminId, "Run with an isolated beta admin configuration");
  const db = testDatabase();
  await db.connect();
  const password = "isolated-beta-admin-password";
  const email = "jonathan.lwowski@gmail.com";
  try {
    await db.query("TRUNCATE beta_invitations");
    await db.query("DELETE FROM users WHERE email=$1", [email]);
    await db.query(
      "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,'Beta administrator',$3)",
      [adminId, email, hashPassword(password)],
    );
    const visitor = await browser.newContext();
    try {
      const viewer = await visitor.newPage();
      await viewer.goto("/admin/beta");
      await expect(viewer).toHaveURL("/");
    } finally {
      await visitor.close();
    }
    await api(page, "auth/login", { email, password });
    await page.goto("/admin/beta");
    await expect(page.getByText("10 of 10 slots available")).toBeVisible();
    await page.getByRole("button", { name: "Create invite" }).click();
    const invite = page.getByLabel(/Copy this one-time link now/);
    await expect(invite).toHaveValue(new RegExp("#invite=[A-Za-z0-9_-]+$"));
    const token = new URL(await invite.inputValue()).hash.slice(
      "#invite=".length,
    );
    await expect(page.getByText("9 of 10 slots available")).toBeVisible();
    await page.getByRole("button", { name: "Revoke invite in slot 1" }).click();
    await expect(page.getByText("10 of 10 slots available")).toBeVisible();

    const signup = (invitation: string) =>
      page.request.post("/api/auth/register", {
        data: {
          email: randomUUID() + "@example.com",
          password,
          agreement_accepted: true,
          agreement_version: AGREEMENT_VERSION,
          invitation,
        },
      });
    expect((await signup(token)).status()).toBe(403);
    await page.getByRole("button", { name: "Create invite" }).click();
    await expect(invite).toHaveValue(new RegExp("#invite=[A-Za-z0-9_-]+$"));
    const issued = new URL(await invite.inputValue()).hash.slice(
      "#invite=".length,
    );
    expect((await signup(issued)).status()).toBe(200);
    expect((await page.goto("/admin/beta"))?.status()).toBe(404);
    await api(page, "auth/login", { email, password });
    await page.goto("/admin/beta");
    await expect(page.getByRole("list", { name: "Invitations" })).toContainText(
      "@example.com",
    );
    await expect(
      page.getByRole("button", { name: /Revoke invite/ }),
    ).toHaveCount(0);
  } finally {
    await db.end();
  }
});
