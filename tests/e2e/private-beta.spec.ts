import { test, expect } from "@playwright/test";
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
const signup = (email: string) => ({
  email,
  password,
  agreement_accepted: true,
  agreement_version: AGREEMENT_VERSION,
});

test("beta signup creates an account without granting beta access", async ({
  page,
}) => {
  const email = randomUUID() + "@example.com";
  await page.goto("/");
  await expect(
    page.getByText(
      "Create an account, then ask the beta admin to approve your signup.",
    ),
  ).toBeVisible();
  await page.getByLabel("Your name").fill("Beta applicant");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("checkbox", { name: /I agree to the User Agreement/ })
    .check();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect
    .poll(async () => (await api(page, "auth")).user?.email)
    .toBe(email);
  expect((await api(page, "flow")).billing).toMatchObject({
    beta: false,
    active: false,
    paymentsEnabled: false,
  });
  const write = await page.request.post("/api/sources", {
    data: {
      filename: "Pending.txt",
      content: "This workspace has not been approved.",
    },
  });
  expect(write.status()).toBe(402);
  expect(await write.json()).toMatchObject({
    error: "Access requires an approved beta email.",
  });
  expect(
    (await page.request.post("/api/billing/checkout", { data: {} })).status(),
  ).toBe(403);
});

test("admin grants beta access to an existing account and removal preserves its export window", async ({
  page,
}) => {
  const adminId = process.env.BETA_ADMIN_USER_ID;
  test.skip(!adminId, "Run with an isolated beta admin configuration");
  const db = testDatabase();
  await db.connect();
  const admin = "jonathan.lwowski@gmail.com";
  const tester = randomUUID() + "@example.com";

  try {
    await db.query("TRUNCATE beta_invitations");
    await db.query("DELETE FROM users WHERE email=$1", [admin]);
    await db.query(
      "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,'Beta administrator',$3)",
      [adminId, admin, hashPassword(password)],
    );
    await api(page, "auth/login", { email: admin, password });
    await page.goto("/admin/beta");
    await expect(
      page.getByRole("heading", { name: "Beta access" }),
    ).toBeVisible();
    await page.getByLabel("Email address").fill(tester);
    await page.getByRole("button", { name: "Add email" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Ask the tester to create an account with that email first.",
    );
    await page.getByLabel("Email address").fill(tester);
    await api(page, "auth/logout", {});
    await page.getByRole("button", { name: "Add email" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Access denied.",
    );
    expect((await db.query("SELECT slot FROM beta_invitations")).rowCount).toBe(
      0,
    );

    const account = await api(page, "auth/register", signup(tester));
    const testerId = account.id;
    expect((await page.goto("/admin/beta"))?.status()).toBe(404);
    await db.query(
      "INSERT INTO subscriptions(user_id,status,paid_until) VALUES($1,'canceled',now()-interval '45 days')",
      [testerId],
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
    expect(
      (await db.query("SELECT user_id FROM beta_invitations WHERE slot=1"))
        .rows[0].user_id,
    ).toBe(testerId);

    await api(page, "auth/login", { email: tester, password });
    expect((await api(page, "flow")).billing).toMatchObject({
      active: true,
      beta: true,
      paymentsEnabled: false,
    });
    expect(
      (
        await api(page, "sources", {
          filename: "Test feedback.txt",
          content: "We need searchable audit trails.",
        })
      ).sources,
    ).toHaveLength(1);

    await api(page, "auth/login", { email: admin, password });
    await page.goto("/admin/beta");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Remove " + tester }).click();
    await expect(
      page.getByRole("list", { name: "Approved beta emails" }),
    ).toContainText(tester);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Remove " + tester }).click();
    await expect(page.getByText("10 of 10 slots available")).toBeVisible();

    await api(page, "auth/login", { email: tester, password });
    const { billing } = await api(page, "flow");
    expect(billing.active).toBe(false);
    expect(new Date(billing.readUntil).getTime()).toBeGreaterThan(
      Date.now() + 29 * 86400000,
    );
    expect((await page.request.get("/api/export")).status()).toBe(200);
    await page.goto("/settings");
    await expect(
      page.getByText(/Read and export your saved work until/),
    ).toBeVisible();
    const maintenance = () =>
      page.request.get("/api/maintenance", {
        headers: { Authorization: "Bearer e2e-maintenance-secret" },
      });
    expect((await maintenance()).ok()).toBe(true);
    expect(
      (await db.query("SELECT id FROM users WHERE id=$1", [testerId])).rowCount,
    ).toBe(1);
    await db.query(
      "UPDATE users SET beta_export_until=now()-interval '1 day',cleanup_after=now()-interval '1 second' WHERE id=$1",
      [testerId],
    );
    expect((await page.request.get("/api/export")).status()).toBe(410);
    expect((await maintenance()).ok()).toBe(true);
    expect(
      (await db.query("SELECT id FROM users WHERE id=$1", [testerId])).rowCount,
    ).toBe(0);
  } finally {
    await db.end();
  }
});
