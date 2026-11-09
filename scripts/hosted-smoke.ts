import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import AdmZip from "adm-zip";
import { officeFixture } from "../tests/fixtures/documents";
const baseURL = process.env.HOSTED_BASE_URL;
if (!baseURL?.startsWith("https://"))
  throw new Error("HOSTED_BASE_URL must be a deployed HTTPS origin");
if (!process.env.HOSTED_TEST_EMAIL || !process.env.HOSTED_TEST_PASSWORD)
  throw new Error("Configure a dedicated hosted smoke-test account");
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
});
const context = await browser.newContext({ baseURL });
async function authorizeDeployment(ctx: typeof context) {
  if (!process.env.VERCEL_AUTOMATION_BYPASS_SECRET) return;
  const response = await ctx.request.get("/", {
    headers: {
      "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      "x-vercel-set-bypass-cookie": "true",
    },
  });
  expect(response.ok()).toBeTruthy();
}
await authorizeDeployment(context);
const page = await context.newPage();
try {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Explore demo", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Your discovery opportunities",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Demo workspace notice")).toContainText(
    "Fictional data",
  );
  const demoResponse = await context.request.get("/api/demo/bootstrap");
  expect(demoResponse.ok()).toBeTruthy();
  const demo = await demoResponse.json();
  expect(demo.user.is_demo).toBe(true);
  expect(demo.customers).toHaveLength(8);
  expect(demo.signals).toHaveLength(40);
  const audit = demo.features.find(
    (f: any) => f.title === "Searchable audit history",
  );
  expect(audit.metrics.for).toBe(3);
  expect(audit.metrics.wouldPay).toBe(2);
  expect(
    (
      await context.request.post("/api/demo/settings/models", {
        data: { provider: "openai" },
      })
    ).status(),
  ).toBe(403);
  await page.goto("/demo/customers");
  await expect(page.getByTestId("company-row")).toHaveCount(8);
  await page.getByTestId("company-row").first().click();
  await expect(
    page.getByRole("heading", { name: "Conversation history", exact: true }),
  ).toBeVisible();
  await page.goto("/demo/signals");
  await expect(page.getByTestId("theme-card").first()).toBeVisible();
  await page.getByTestId("theme-card").first().click();
  await expect(page.getByTestId("research-signal").first()).toBeVisible();
  await page
    .getByTestId("research-signal")
    .first()
    .getByRole("button")
    .first()
    .click();
  await expect(page.getByRole("dialog").locator("mark")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  console.log("Hosted Customers, Signals, themes, and source quotes passed.");
  await mkdir("test-results-hosted", { recursive: true });
  await page.screenshot({
    path: "test-results-hosted/demo.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    (await context.request.post("/api/demo/auth/logout", { data: {} })).ok(),
  ).toBeTruthy();
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill(process.env.HOSTED_TEST_EMAIL);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.HOSTED_TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Turn customer conversations into product opportunities.",
    }),
  ).toBeVisible();
  const meta = await context.request.get("/api/bootstrap?paged=1");
  expect(meta.ok()).toBeTruthy();
  expect((await meta.json()).uploadMode).toBe("blob");
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "evidence_session")?.secure).toBe(true);
  await page.goto("/transcripts");
  await expect(
    page.getByRole("heading", {
      name: "Turn customer conversations into product opportunities.",
    }),
  ).toBeVisible();
  await page.goto("/settings");
  await expect(
    page.getByRole("button", { name: "Save connection" }),
  ).toBeVisible();
  console.log("Hosted demo, sign-in, and provider settings passed.");
  if (process.env.HOSTED_TEST_AI === "true") {
    const api = async (
      path: string,
      body?: unknown,
      method = body ? "POST" : "GET",
    ) => {
      const r = await context.request.fetch("/api/" + path, {
        method,
        data: body,
      });
      const data = await r.json();
      expect(r.ok(), JSON.stringify(data)).toBeTruthy();
      return data;
    };
    const name = "Hosted smoke customer";
    const existing = await api(
      "workspace/customers?q=" + encodeURIComponent(name),
    );
    const customer =
      existing.items.find((c: any) => c.name === name) ??
      (await api("customers", {
        name,
        segment: "Test",
        notes: "Synthetic deployment smoke account",
      }));
    const created: string[] = [];
    try {
      if (process.env.HOSTED_TEST_AI === "true") {
        const imported = await api("transcripts", {
          customer_id: customer.id,
          title: "Hosted AI smoke " + randomUUID(),
          content:
            "[00:12] Customer: We need searchable audit logs before buying.\n[00:20] Customer: We would pay for this capability.",
        });
        const tid = imported.transcripts[0].id;
        created.push(tid);
        const job = await api("transcripts/" + tid + "/extract", {});
        await expect
          .poll(
            async () => {
              const r = await api("bootstrap?paged=1");
              return r.jobs.find((j: any) => j.id === job.id)?.state;
            },
            { timeout: 180000, intervals: [2000] },
          )
          .toBe("succeeded");
      }
    } finally {
      for (const tid of created)
        await api("transcripts/" + tid, undefined, "DELETE");
    }
  }
  if (
    process.env.HOSTED_TEST_DISCOVERY_UPLOAD === "true" ||
    process.env.HOSTED_TEST_UPLOAD === "true"
  ) {
    // Only the hosted test account and fictional data; block report creation before AI usage.
    await page.route("**/api/reports", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Hosted upload verified; AI generation intentionally skipped.",
        }),
      });
    });
    await page.goto("/?new=1");
    const zip = new AdmZip();
    const original =
      "Hosted test only. We need audit logs before we can buy. " + randomUUID();
    let originalDocument: Buffer = Buffer.from(original);
    let originalName = "Hosted discovery progress.txt";
    if (process.env.HOSTED_TEST_UPLOAD === "true") {
      // Exercise large binary uploads while respecting the extracted-text limit.
      const document = new AdmZip(officeFixture("docx", [original]));
      document.addFile("word/media/synthetic.bin", randomBytes(5_500_000));
      originalDocument = document.toBuffer();
      originalName = "Hosted discovery progress.docx";
      expect(originalDocument.length).toBeGreaterThan(4_500_000);
      expect(originalDocument.length).toBeLessThan(10_000_000);
    }
    zip.addFile(originalName, originalDocument);
    zip.addFile(
      "Hosted discovery second.txt",
      Buffer.from(original + " A separate fictional call."),
    );
    zip.addFile(
      "Hosted screenshot.svg",
      Buffer.from("unsupported image fixture"),
    );
    await page.getByLabel("Discovery files", { exact: true }).setInputFiles({
      name: "hosted-progress-check.zip",
      mimeType: "application/zip",
      buffer: zip.toBuffer(),
    });
    await expect(page.locator(".flow-files .flow-file")).toHaveCount(2);
    await expect(page.getByLabel("Import warnings")).toContainText(
      "Hosted screenshot.svg",
    );
    await page
      .getByRole("button", { name: "Find opportunities", exact: true })
      .click();
    const importError = page.locator(".flow-error[role=alert]");
    await expect(importError).toBeVisible({ timeout: 90000 });
    expect(
      await importError.textContent(),
      (await page.getByLabel("Import warnings").textContent()) ?? "",
    ).toContain("AI generation intentionally skipped");
    const metadata = await context.request.get("/api/flow");
    expect(metadata.ok()).toBeTruthy();
    const saved = (await metadata.json()).sources.find(
      (s: any) =>
        s.sha256 ===
        createHash("sha256")
          .update(originalDocument.toString("base64"))
          .digest("hex"),
    );
    expect(saved).toBeTruthy();
    const download = await context.request.get(
      "/api/sources/" + saved.id + "/download",
    );
    expect(download.ok()).toBeTruthy();
    expect(await download.body()).toEqual(originalDocument);
    const anonymous = await browser.newContext({ baseURL });
    await authorizeDeployment(anonymous);
    expect(
      (
        await anonymous.request.get("/api/sources/" + saved.id + "/download")
      ).status(),
    ).toBe(401);
    await anonymous.close();
    let duplicateReservations = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/uploads/reserve"))
        duplicateReservations++;
    });
    const beforeReuse = (await (await context.request.get("/api/flow")).json())
      .sources.length;
    await page.getByLabel("Discovery files", { exact: true }).setInputFiles({
      name: "renamed-duplicate-batch.zip",
      mimeType: "application/zip",
      buffer: zip.toBuffer(),
    });
    await expect(page.getByLabel("Import warnings")).toContainText(
      "Reused saved source",
    );
    await expect(page.locator(".flow-files .flow-file")).toHaveCount(0);
    expect(duplicateReservations).toBe(0);
    expect(
      (await (await context.request.get("/api/flow")).json()).sources,
    ).toHaveLength(beforeReuse);
    await page.screenshot({
      path: "test-results-hosted/discovery-import.png",
      fullPage: true,
    });
    console.log(
      "Hosted ZIP parsing, duplicate reuse without uploads, streaming progress, and private originals passed without AI requests.",
    );
  }
  if (process.env.CRON_SECRET) {
    const maintenance = await context.request.get("/api/maintenance", {
      headers: { Authorization: "Bearer " + process.env.CRON_SECRET },
    });
    expect(maintenance.ok()).toBeTruthy();
  }
  console.log(
    "Hosted HTTPS, session, storage and requested live service checks passed.",
  );
} finally {
  await mkdir("test-results-hosted", { recursive: true });
  await page
    .screenshot({ path: "test-results-hosted/smoke.png", fullPage: true })
    .catch(() => {});
  await browser.close();
}
