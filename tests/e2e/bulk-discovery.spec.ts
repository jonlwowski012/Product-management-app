import { test, expect, type Page } from "@playwright/test";
import AdmZip from "adm-zip";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { signup, api } from "./helpers";
import { pdfFixture } from "../fixtures/documents";
const quote = "We need audit logs before we can buy.";

async function analyze(page: Page, count: number) {
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your discovery opportunities",
      exact: true,
    }),
  ).toBeVisible({ timeout: 60000 });
  const rid = page.url().split("/").at(-1);
  const report = await api(page, "reports/" + rid);
  expect(report.sources).toHaveLength(count);
  return report;
}
test("ZIP imports individual calls through private Blob, deduplicates, and survives archive cleanup", async ({
  page,
}) => {
  await signup(page);
  const zip = new AdmZip();
  const pdf = pdfFixture([quote + " A second customer."]);
  zip.addFile("calls/one.txt", Buffer.from(quote));
  zip.addFile("calls/duplicate.txt", Buffer.from(quote));
  zip.addFile("calls/two.pdf", pdf);
  zip.addFile("__MACOSX/._one.txt", Buffer.from("system metadata"));
  await page.getByLabel("Discovery files", { exact: true }).setInputFiles({
    name: "calls.zip",
    mimeType: "application/zip",
    buffer: zip.toBuffer(),
  });
  const report = await analyze(page, 2);
  expect(
    report.sources.every((s: any) => s.filename.startsWith("calls — ")),
  ).toBe(true);
  const source = report.sources.find((s: any) =>
    s.filename.endsWith("two.pdf"),
  );
  await page.request.get("/api/maintenance", {
    headers: { Authorization: "Bearer e2e-maintenance-secret" },
  });
  const original = await page.request.get(
    "/api/sources/" + source.id + "/download",
  );
  expect(original.ok()).toBeTruthy();
  expect(await original.body()).toEqual(pdf);
  const text = await api(page, "sources/" + source.id);
  expect(text.page.text).toContain("A second customer.");
  expect((await api(page, "flow")).sources).toHaveLength(2);
  await page
    .getByTestId("opportunity-card")
    .first()
    .locator("summary")
    .filter({ hasText: "View evidence" })
    .click();
  await page
    .getByRole("button", { name: /calls — .* ·/ })
    .first()
    .click();
  await expect(page.getByRole("dialog").locator("mark")).toContainText(quote);
});
test("folder picker includes nested calls with distinct names and skips system files", async ({
  page,
}) => {
  const root = await mkdtemp(path.join(tmpdir(), "discovery-folder-"));
  try {
    await mkdir(path.join(root, "Customer B"));
    await writeFile(path.join(root, "call.txt"), quote);
    await writeFile(
      path.join(root, "Customer B", "call.txt"),
      quote + " Another team.",
    );
    await writeFile(path.join(root, ".DS_Store"), "hidden metadata");
    await signup(page);
    await expect(
      page.getByRole("button", { name: "Choose folder", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Discovery folder", { exact: true })
      .setInputFiles(root);
    await expect(page.locator(".flow-files .flow-file")).toHaveCount(2);
    const report = await analyze(page, 2);
    expect(
      report.sources.some((s: any) =>
        s.filename.includes("Customer B — call.txt"),
      ),
    ).toBe(true);
    expect(new Set(report.sources.map((s: any) => s.filename)).size).toBe(2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("ZIP can be dropped directly into the discovery workflow", async ({
  page,
}) => {
  await signup(page);
  const zip = new AdmZip();
  zip.addFile("first.txt", Buffer.from(quote));
  zip.addFile("second.txt", Buffer.from(quote + " Another customer."));
  await page.locator(".flow-drop").evaluate((element, bytes) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(
      new File([new Uint8Array(bytes)], "dropped-calls.zip", {
        type: "application/zip",
      }),
    );
    element.dispatchEvent(
      new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }),
    );
  }, Array.from(zip.toBuffer()));
  await expect(page.locator(".flow-files")).toContainText("first.txt");
  await analyze(page, 2);
});
test("drop zone reads nested directory entries and imports all batches", async ({
  page,
}) => {
  await signup(page);
  await page.locator(".flow-drop").evaluate((element, quote) => {
    const file = (name: string, text: string) => ({
      name,
      isFile: true,
      isDirectory: false,
      file: (done: (f: File) => void) =>
        done(new File([text], name, { type: "text/plain" })),
    });
    const directory = (name: string, entries: unknown[]) => ({
      name,
      isFile: false,
      isDirectory: true,
      createReader: () => {
        let done = false;
        return {
          readEntries: (callback: (e: unknown[]) => void) => {
            callback(done ? [] : entries);
            done = true;
          },
        };
      },
    });
    const root = directory("Customer calls", [
      file("first.txt", quote),
      directory("More calls", [
        file("second.txt", quote + " Another customer."),
      ]),
    ]);
    const dataTransfer = new DataTransfer();
    Object.defineProperty(dataTransfer, "items", {
      value: [{ webkitGetAsEntry: () => root }],
    });
    element.dispatchEvent(
      new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }),
    );
  }, quote);
  await expect(page.locator(".flow-files .flow-file")).toHaveCount(2);
  await expect(page.locator(".flow-files")).toContainText(
    "Customer calls — More calls — second.txt",
  );
  await analyze(page, 2);
});
test("selections beyond 1,000 documents fail clearly while unsupported ZIP entries are warnings", async ({
  page,
}) => {
  await signup(page);
  await page.getByLabel("Discovery files", { exact: true }).setInputFiles(
    Array.from({ length: 1001 }, (_, i) => ({
      name: `call-${i}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from(quote + " " + i),
    })),
  );
  await expect(page.locator(".flow-error[role=alert]")).toContainText("1,000");
  await expect(page.locator(".flow-files .flow-file")).toHaveCount(0);
  const zip = new AdmZip();
  zip.addFile("call.mp4", Buffer.from("video"));
  zip.addFile("call.txt", Buffer.from(quote));
  await page.getByLabel("Discovery files", { exact: true }).setInputFiles({
    name: "recordings.zip",
    mimeType: "application/zip",
    buffer: zip.toBuffer(),
  });
  await expect(page.getByLabel("Import warnings")).toContainText("call.mp4");
  await expect(page.locator(".flow-files .flow-file")).toHaveCount(1);
  await analyze(page, 1);
});
test("unsupported screenshots and corrupt documents warn while other files produce a report", async ({
  page,
}) => {
  await signup(page);
  await page.getByLabel("Discovery files", { exact: true }).setInputFiles([
    {
      name: "Customer Notes — Screenshot.png.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("image"),
    },
    { name: "good.txt", mimeType: "text/plain", buffer: Buffer.from(quote) },
    {
      name: "broken.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("invalid PDF"),
    },
  ]);
  await expect(page.getByLabel("Import warnings")).toContainText(
    "Screenshot.png.svg",
  );
  await analyze(page, 1);
  await expect(page.getByLabel("Import warnings")).toContainText("broken.pdf");
});
test("501 ZIP documents upload with live progress and bounded concurrency, then aggregate into a report", async ({
  page,
}) => {
  test.setTimeout(300000);
  await signup(page);
  const zip = new AdmZip();
  for (let i = 0; i < 501; i++)
    zip.addFile(`calls/call-${i}.txt`, Buffer.from(quote + ` Customer ${i}.`));
  zip.addFile("calls/screenshot.svg", Buffer.from("image"));
  await page.getByLabel("Discovery files", { exact: true }).setInputFiles({
    name: "501-calls.zip",
    mimeType: "application/zip",
    buffer: zip.toBuffer(),
  });
  await expect(page.locator(".flow-files")).toContainText(
    "501 documents selected",
  );
  await expect(page.locator(".flow-files .flow-file")).toHaveCount(25);
  let active = 0,
    maxActive = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/uploads/complete")) {
      active++;
      maxActive = Math.max(maxActive, active);
    }
  });
  const finished = (request: any) => {
    if (request.url().endsWith("/api/uploads/complete")) active--;
  };
  page.on("requestfinished", finished);
  page.on("requestfailed", finished);
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  await expect(
    page.getByRole("progressbar", { name: "Import progress", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Import status")).toContainText(
    "of 501 files processed",
  );
  await expect
    .poll(
      async () =>
        Number(
          await page
            .getByRole("progressbar", { name: "Import progress", exact: true })
            .getAttribute("value"),
        ),
      { timeout: 30000 },
    )
    .toBeGreaterThan(0);
  await expect(
    page.getByRole("heading", {
      name: "Your discovery opportunities",
      exact: true,
    }),
  ).toBeVisible({ timeout: 240000 });
  const result = await api(page, "reports/" + page.url().split("/").at(-1));
  expect(result.sources).toHaveLength(501);
  expect(result.result.coverage.sources).toBe(501);
  expect(result.job.reduction_total).toBeGreaterThan(0);
  expect(result.job.reduction_completed).toBe(result.job.reduction_total);
  expect(maxActive).toBeLessThanOrEqual(4);
  expect((await api(page, "flow")).sources).toHaveLength(501);
  expect(
    result.result.findings.every((f: any) =>
      result.sources.some((s: any) => s.id === f.source_id),
    ),
  ).toBe(true);
  await expect(page.getByLabel("Import warnings")).toContainText(
    "screenshot.svg",
  );
});
test("cancel preserves completed imports and does not start an analysis", async ({
  page,
}) => {
  await signup(page);
  await page.route("http://127.0.0.1:3102/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue().catch(() => {});
  });
  await page.getByLabel("Discovery files", { exact: true }).setInputFiles(
    Array.from({ length: 40 }, (_, i) => ({
      name: `call-${i}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from(quote + " " + i),
    })),
  );
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel import", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel import", exact: true })
    .click();
  await expect(page.getByLabel("Import warnings")).toContainText(
    "Import cancelled",
  );
  expect((await api(page, "flow")).reports).toHaveLength(0);
});
