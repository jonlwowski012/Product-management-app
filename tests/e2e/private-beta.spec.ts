import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hashPassword } from "../../lib/crypto";
import { AGREEMENT_VERSION } from "../../lib/user-agreement";
import { api, testDatabase } from "./helpers";

test.describe.configure({ mode: "serial" });
test.skip(
  process.env.BETA_MODE !== "true",
  "Run against the isolated beta configuration",
);

const password = "isolated-beta-password";
const signup = (email: string, beta_code?: string) => ({
  email,
  password,
  beta_code,
  agreement_accepted: true,
  agreement_version: AGREEMENT_VERSION,
});

const mail = (page: Page, email: string) =>
  page.request.get(
    "http://127.0.0.1:3105/mail?email=" + encodeURIComponent(email),
  );

async function deliveredCode(page: Page, email: string, previous?: string) {
  let code: string | undefined;
  await expect
    .poll(async () => {
      const message = await mail(page, email);
      if (!message.ok()) return false;
      code = (await message.text()).match(/\b\d{8}\b/)?.[0];
      return !!code && code !== previous;
    })
    .toBe(true);
  return code!;
}

test("approved email signup requires a fresh one-time verification code", async ({
  page,
}) => {
  const db = testDatabase();
  await db.connect();
  const email = randomUUID() + "@example.com";
  const unapproved = randomUUID() + "@example.com";
  const failedDelivery = randomUUID() + "@provider-failure.example.test";
  try {
    await db.query("TRUNCATE beta_invitations");
    await db.query(
      "INSERT INTO beta_invitations(slot,approved_email,token_hash) VALUES(1,$1,gen_random_uuid()::text),(2,$2,gen_random_uuid()::text)",
      [email, failedDelivery],
    );
    expect(await api(page, "auth/beta-code", { email: unapproved })).toEqual(
      await api(page, "auth/beta-code", { email: failedDelivery }),
    );
    await expect
      .poll(
        async () =>
          (
            await db.query(
              "SELECT code_sent_at<now()-interval '3 minutes' AS failed FROM beta_invitations WHERE approved_email=$1",
              [failedDelivery],
            )
          ).rows[0].failed,
      )
      .toBe(true);
    expect((await mail(page, failedDelivery)).status()).toBe(404);
    expect((await mail(page, unapproved)).status()).toBe(404);
    const register = (beta_code?: string) =>
      page.request.post("/api/auth/register", {
        data: signup(email, beta_code),
      });
    expect((await register()).status()).toBe(403);

    await page.goto("/");
    await page.getByLabel("Your name").fill("Beta Tester");
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Send email code" }).click();
    await expect(
      page.getByText("If this email is approved, a code will arrive shortly."),
    ).toBeVisible();
    const code = await deliveredCode(page, email);
    for (let retry = 0; retry < 3; retry++)
      await api(page, "auth/beta-code", { email });
    expect(await deliveredCode(page, email)).toBe(code);

    expect(
      (await register(code === "00000000" ? "11111111" : "00000000")).status(),
    ).toBe(403);
    await db.query(
      "UPDATE beta_invitations SET code_expires_at=now()-interval '1 second' WHERE approved_email=$1",
      [email],
    );
    expect((await register(code)).status()).toBe(403);
    await db.query(
      "UPDATE beta_invitations SET code_sent_at=now()-interval '6 minutes' WHERE approved_email=$1",
      [email],
    );
    await page.getByRole("button", { name: "Send email code" }).click();
    await expect(
      page.getByText("If this email is approved, a code will arrive shortly."),
    ).toBeVisible();
    await page
      .getByLabel("8-digit email code")
      .fill(await deliveredCode(page, email, code));
    await page.getByLabel("Password", { exact: true }).fill(password);
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
    const {
      rows: [approval],
    } = await db.query(
      "SELECT user_id,code_hash,code_expires_at FROM beta_invitations WHERE approved_email=$1",
      [email],
    );
    expect(approval).toMatchObject({
      user_id: expect.any(String),
      code_hash: null,
      code_expires_at: null,
    });
    expect(
      (
        await api(page, "sources", {
          filename: "Beta feedback.txt",
          content: "We need audit logs before we can buy.",
        })
      ).sources,
    ).toHaveLength(1);
    expect(
      (await page.request.post("/api/billing/checkout", { data: {} })).status(),
    ).toBe(403);
  } finally {
    await db.end();
  }
});

test("admin can approve an existing account and remove its beta access", async ({
  page,
}) => {
  const adminId = process.env.BETA_ADMIN_USER_ID;
  test.skip(!adminId, "Run with an isolated beta admin configuration");
  const db = testDatabase();
  await db.connect();
  const admin = "jonathan.lwowski@gmail.com";
  const tester = randomUUID() + "@example.com";
  const testerId = randomUUID();
  try {
    await db.query("TRUNCATE beta_invitations");
    await db.query("DELETE FROM users WHERE email=$1", [admin]);
    for (const [id, email] of [
      [adminId, admin],
      [testerId, tester],
    ]) {
      await db.query(
        "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,'Beta tester',$3)",
        [id, email, hashPassword(password)],
      );
      await db.query("INSERT INTO settings(user_id) VALUES($1)", [id]);
    }
    await db.query(
      "INSERT INTO subscriptions(user_id,status,paid_until) VALUES($1,'canceled',now()-interval '45 days')",
      [testerId],
    );
    await api(page, "auth/login", { email: admin, password });
    await page.goto("/admin/beta");
    await expect(
      page.getByRole("heading", { name: "Beta access" }),
    ).toBeVisible();
    await page.getByLabel("Email address").fill(tester.toUpperCase());
    await api(page, "auth/logout", {});
    await page.getByRole("button", { name: "Add email" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Access denied.",
    );
    expect((await db.query("SELECT slot FROM beta_invitations")).rowCount).toBe(
      0,
    );

    await db.query(
      "INSERT INTO beta_invitations(slot,token_hash) SELECT n,'old-link-'||n FROM generate_series(1,10) n",
    );
    await api(page, "auth/login", { email: admin, password });
    await page.goto("/admin/beta");
    await page.getByLabel("Email address").fill(tester.toUpperCase());
    await page.getByRole("button", { name: "Add email" }).click();
    await expect(
      page.getByRole("list", { name: "Approved beta emails" }),
    ).toContainText(tester);
    await expect(page.getByText("9 of 10 slots available")).toBeVisible();
    expect((await mail(page, tester)).status()).toBe(404);

    expect(
      (
        await page.request.post("/api/auth/register", { data: signup(tester) })
      ).status(),
    ).toBe(403);

    await api(page, "auth/beta-code", { email: tester });
    await api(page, "auth/login", {
      email: tester,
      password,
      beta_code: await deliveredCode(page, tester),
    });
    expect((await api(page, "flow")).billing.active).toBe(true);
    expect((await page.goto("/admin/beta"))?.status()).toBe(404);

    await api(page, "auth/login", { email: admin, password });
    await page.goto("/admin/beta");
    await expect(
      page.getByRole("list", { name: "Approved beta emails" }),
    ).toContainText("Active");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Remove " + tester }).click();
    await expect(
      page.getByRole("list", { name: "Approved beta emails" }),
    ).toContainText("Active");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Remove " + tester }).click();
    await expect(page.getByText("10 of 10 slots available")).toBeVisible();
    await api(page, "auth/login", { email: tester, password });
    const { billing } = await api(page, "flow");
    expect(billing.active).toBe(false);
    expect(new Date(billing.readUntil).getTime()).toBeGreaterThan(
      Date.now() + 29 * 86400000,
    );
    const write = await page.request.post("/api/sources", {
      data: {
        filename: "Revoked.txt",
        content: "This workspace does not have beta access.",
      },
    });
    expect(write.status()).toBe(402);
    expect(await write.json()).toMatchObject({
      error: "Access requires an approved beta email.",
    });
    expect((await page.request.get("/api/export")).status()).toBe(200);
    await page.goto("/settings");
    await expect(
      page.getByText(/Read and export your saved work until/),
    ).toBeVisible();
    const maintenance = await page.request.get("/api/maintenance", {
      headers: { Authorization: "Bearer e2e-maintenance-secret" },
    });
    expect(maintenance.ok()).toBe(true);
    expect(
      (await db.query("SELECT id FROM users WHERE id=$1", [testerId])).rowCount,
    ).toBe(1);
    await db.query(
      "UPDATE users SET beta_export_until=now()-interval '1 day',cleanup_after=now()-interval '1 second' WHERE id=$1",
      [testerId],
    );
    expect((await page.request.get("/api/export")).status()).toBe(410);
    expect(
      (
        await page.request.get("/api/maintenance", {
          headers: { Authorization: "Bearer e2e-maintenance-secret" },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (await db.query("SELECT id FROM users WHERE id=$1", [testerId])).rowCount,
    ).toBe(0);
  } finally {
    await db.end();
  }
});
