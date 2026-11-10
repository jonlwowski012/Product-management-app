import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  AGREEMENT_VERSION,
  AGREEMENT_ACCEPTANCE,
  userAgreement,
} from "../../lib/user-agreement";
import { api, testDatabase } from "./helpers";

test("signup requires a deliberate checkbox and agreement links preserve the form on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Your name").fill("Agreement Tester");
  const email = `agreement-${randomUUID()}@example.com`;
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("a-secure-test-password");
  const checkbox = page.getByRole("checkbox", { name: AGREEMENT_ACCEPTANCE });
  await expect(checkbox).not.toBeChecked();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByLabel("Your name")).toBeVisible();
  expect(
    await checkbox.evaluate(
      (element: HTMLInputElement) => element.validity.valueMissing,
    ),
  ).toBe(true);
  expect((await api(page, "auth/me")).user).toBeNull();

  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("link", { name: "User Agreement", exact: true }).click();
  const agreement = await popupPromise;
  await expect(
    agreement.getByRole("heading", { name: "User Agreement", exact: true }),
  ).toBeVisible();
  await expect(
    agreement.getByText(`Version ${AGREEMENT_VERSION}`, { exact: false }),
  ).toBeVisible();
  await expect(
    agreement.getByRole("heading", {
      name: "10. Limitation of liability",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await agreement.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await agreement.close();
  await expect(page.getByLabel("Email address")).toHaveValue(email);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await checkbox.check();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator(".marketing-home")).toHaveCount(0);
});

test("registration API rejects missing, false, malformed, and stale acceptance without creating accounts", async ({
  page,
}) => {
  const emails: string[] = [];
  for (const acceptance of [
    {},
    { agreement_accepted: false, agreement_version: AGREEMENT_VERSION },
    { agreement_accepted: "true", agreement_version: AGREEMENT_VERSION },
    { agreement_accepted: true },
    { agreement_accepted: true, agreement_version: "old-version" },
    { agreement_accepted: true, agreement_version: [AGREEMENT_VERSION] },
  ]) {
    const email = `rejected-${randomUUID()}@example.com`;
    emails.push(email);
    const response = await page.request.post("/api/auth/register", {
      data: {
        email,
        name: "Rejected Signup",
        password: "a-secure-test-password",
        ...acceptance,
      },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toContain(
      "Accept the current User Agreement",
    );
    expect(response.headers()["set-cookie"]).toBeUndefined();
  }
  const db = testDatabase();
  await db.connect();
  try {
    expect(
      (await db.query("SELECT id FROM users WHERE email=ANY($1)", [emails]))
        .rows,
    ).toHaveLength(0);
  } finally {
    await db.end();
  }
});

test("acceptance records the actual agreement once and remains in exports beyond recent activity", async ({
  page,
}) => {
  const email = `accepted-${randomUUID()}@example.com`;
  const before = Date.now();
  const result = await api(page, "auth/register", {
    email,
    name: "Accepted Signup",
    password: "a-secure-test-password",
    agreement_accepted: true,
    agreement_version: AGREEMENT_VERSION,
  });
  const db = testDatabase();
  await db.connect();
  try {
    const {
      rows: [receipt],
    } = await db.query(
      "SELECT created_at,detail FROM audit WHERE user_id=$1 AND action='user_agreement.accepted'",
      [result.id],
    );
    expect(receipt.detail.version).toBe(AGREEMENT_VERSION);
    expect(receipt.detail.acceptance).toBe(AGREEMENT_ACCEPTANCE);
    expect(receipt.detail.sections).toEqual(userAgreement().sections);
    expect(receipt.detail.operator).toBeTruthy();
    expect(receipt.detail.contact).toBeTruthy();
    expect(new Date(receipt.created_at).getTime()).toBeGreaterThanOrEqual(
      before - 1000,
    );
    expect(new Date(receipt.created_at).getTime()).toBeLessThanOrEqual(
      Date.now() + 1000,
    );
    await db.query(
      "INSERT INTO audit(id,user_id,action,entity_type) SELECT gen_random_uuid(),$1,'test.activity','user' FROM generate_series(1,81)",
      [result.id],
    );
    const exported = await api(page, "export");
    expect(
      exported.audit.some(
        (entry: { action: string }) =>
          entry.action === "user_agreement.accepted",
      ),
    ).toBe(false);
    expect(exported.agreementAcceptances).toEqual([
      { created_at: receipt.created_at.toISOString(), detail: receipt.detail },
    ]);
    await api(page, "auth/logout", {});
    await api(page, "auth/login", {
      email,
      password: "a-secure-test-password",
    });
    expect(
      (
        await db.query(
          "SELECT id FROM audit WHERE user_id=$1 AND action='user_agreement.accepted'",
          [result.id],
        )
      ).rows,
    ).toHaveLength(1);

    // An older account's login must not invent acceptance of new terms.
    await db.query(
      "DELETE FROM audit WHERE user_id=$1 AND action='user_agreement.accepted'",
      [result.id],
    );
    await api(page, "auth/logout", {});
    await api(page, "auth/login", {
      email,
      password: "a-secure-test-password",
    });
    expect((await api(page, "export")).agreementAcceptances).toEqual([]);
  } finally {
    await db.end();
  }
});
