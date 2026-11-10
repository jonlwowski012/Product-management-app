import "dotenv/config";
import { chromium, expect } from "@playwright/test";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { signup, api, seed, manual } from "../tests/e2e/helpers";
import { pdfFixture, officeFixture } from "../tests/fixtures/documents";
const manifest = JSON.parse(
  await readFile(".next/diagnostics/workflows-manifest.json", "utf8"),
);
for (const name of ["prepare", "extract", "publish", "failed"])
  expect(manifest.steps["lib/workflows/steps.ts"]?.[name]).toBeTruthy();
expect(
  manifest.workflows["lib/workflows/discovery.ts"]?.discoveryWorkflow,
).toBeTruthy();
const url = new URL(process.env.DATABASE_URL!);
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const name = "production_" + randomUUID().replaceAll("-", "") + "_e2e";
url.pathname = "/" + name;
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
await admin.query(`CREATE DATABASE "${name}"`);
const database = new pg.Client({ connectionString: url.toString() });
await database.connect();
await database.query(
  (await readFile(new URL("../lib/schema.sql", import.meta.url), "utf8")) +
    "\n" +
    (await readFile(new URL("../lib/hosting.sql", import.meta.url), "utf8")) +
    "\n" +
    (await readFile(new URL("../lib/demo.sql", import.meta.url), "utf8")) +
    "\n" +
    (await readFile(new URL("../lib/workflow.sql", import.meta.url), "utf8")) +
    "\n" +
    (await readFile(new URL("../lib/groq.sql", import.meta.url), "utf8")) +
    "\n" +
    (await readFile(
      new URL("../lib/bulk-discovery.sql", import.meta.url),
      "utf8",
    )) +
    "\n" +
    (await readFile(
      new URL("../lib/workflow-capacity.sql", import.meta.url),
      "utf8",
    )) +
    "\n" +
    (await readFile(
      new URL("../lib/groq-rate-limits.sql", import.meta.url),
      "utf8",
    )) +
    "\n" +
    (await readFile(
      new URL("../lib/analysis-warnings.sql", import.meta.url),
      "utf8",
    )) +
    "\n" +
    (await readFile(new URL("../lib/gemini.sql", import.meta.url), "utf8")) +
    "\n" +
    (await readFile(new URL("../lib/research.sql", import.meta.url), "utf8")) +
    "\n" +
    (await readFile(
      new URL("../lib/discovery-experience.sql", import.meta.url),
      "utf8",
    )) +
    "\n" +
    (await readFile(
      new URL("../lib/commercial.sql", import.meta.url),
      "utf8",
    )) +
    "\n" +
    (await readFile(
      new URL("../lib/commercial-review.sql", import.meta.url),
      "utf8",
    )) +
    "\n" +
    (await readFile(
      new URL("../lib/commercial-concurrency.sql", import.meta.url),
      "utf8",
    )) +
    "\n" +
    (await readFile(
      new URL("../lib/account-deletion.sql", import.meta.url),
      "utf8",
    )),
);
await database.end();
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3200",
  ],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: url.toString(),
      APP_SECRET: "production-smoke-only-secret-123456789012345",
      APP_URL: "http://127.0.0.1:3200",
      COOKIE_SECURE: "false",
      DATA_DIR: ".local/production-smoke-data",
      E2E_TEST_MODE: "",
      E2E_PROVIDER_BASE_URL: "",
    },
  },
);
let browser;
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch("http://127.0.0.1:3200");
      if (response.ok) {
        ready = true;
        expect(response.headers.get("content-security-policy")).not.toContain(
          "unsafe-eval",
        );
        expect(response.headers.get("content-security-policy")).toContain(
          "https://vercel.com/api/blob/",
        );
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) throw new Error("Production server did not start");
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
  });
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3200",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  process.env.TEST_DATABASE_URL = url.toString();
  process.env.TEST_APP_SECRET = "production-smoke-only-secret-123456789012345";
  await signup(page);
  const defaults = (await api(page, "bootstrap")).settings;
  expect(defaults.provider).toBe("openai");
  expect(defaults.model).toBe("gpt-4.1-mini");
  const sampleQuote = "We need audit logs before we can buy.";
  for (const file of [
    {
      name: "Research.pdf",
      mimeType: "application/pdf",
      buffer: pdfFixture([sampleQuote]),
    },
    {
      name: "Notes.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: officeFixture("docx", [sampleQuote]),
    },
    {
      name: "Strategy.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: officeFixture("pptx", [sampleQuote]),
    },
  ]) {
    const response = await page.request.post("/api/sources", {
      multipart: { files: file },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const created = await response.json();
    const sourceText = await api(page, "sources/" + created.sources[0].id);
    expect(sourceText.page.text).toContain(sampleQuote);
    const original = await page.request.get(
      "/api/sources/" + created.sources[0].id + "/download",
    );
    expect(original.ok()).toBeTruthy();
    expect(Buffer.from(await original.body())).toEqual(file.buffer);
  }
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Your account", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save connection", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Model ID", { exact: true })).toHaveCount(0);
  const conversation = await seed(page);
  await manual(page, conversation.customer, conversation.transcript);
  await page.goto("/customers/" + conversation.customer);
  await expect(page.getByTestId("conversation-row")).toHaveCount(1);
  await page
    .getByRole("link", { name: "See all company signals", exact: true })
    .click();
  await expect(page.getByTestId("research-signal")).toHaveCount(1);
  await page
    .getByTestId("research-signal")
    .getByRole("button", { name: /Acme discovery/ })
    .click();
  await expect(page.getByRole("dialog").locator("mark")).toHaveText(
    sampleQuote,
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.goto("/features/old-feature");
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", {
      name: "Turn customer conversations into product opportunities.",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/production-smoke.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  console.log(
    "Production browser smoke passed: authentication, PDF/Word/slides parsing, private originals, basic Settings, customer history, signal/source browsing, legacy route redirects and CSP.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    if (server.exitCode !== null) resolve();
    else server.once("exit", () => resolve());
  });
  await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
}
