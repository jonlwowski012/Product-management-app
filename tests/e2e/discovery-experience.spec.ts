import { test, expect } from "@playwright/test";
import { signup, api, connect } from "./helpers";
import pg from "pg";
import { readDocument } from "../../lib/documents";

test("a user can discover, inspect risks, choose, record learning, and retain it after an update", async ({
  page,
}) => {
  await signup(page);
  await expect(page.getByLabel("Discovery steps")).toContainText(
    "Upload transcripts",
  );
  await expect(page.getByLabel("Analysis readiness")).toContainText(
    "Your analysis connection is ready",
  );
  await page
    .getByLabel("Or paste customer notes")
    .fill(
      [
        "We need audit logs before we can buy.",
        "We do not need detailed audit history for our three-person team.",
        "We have to move workloads when nodes are removed for maintenance.",
      ].join("\n"),
    );
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  await expect(page.getByTestId("opportunity-card")).toHaveCount(1, {
    timeout: 60000,
  });
  const rid = page.url().split("/").pop()!;
  const card = page.getByTestId("opportunity-card");
  await expect(page.getByLabel("Analysis status")).toContainText("Complete");
  await expect(page.getByLabel("Opportunity overview")).toContainText("Next:");
  await expect(card.getByLabel("Example customer evidence")).toContainText(
    "We need audit logs",
  );
  await card.locator("summary").filter({ hasText: "View evidence" }).click();
  await expect(
    card.getByRole("heading", { name: "Direct challenges", exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole("heading", { name: "Risks and constraints", exact: true }),
  ).toBeVisible();
  await expect(card).toContainText(
    "This operational constraint affects delivery",
  );
  await card
    .getByRole("button", { name: "Choose this opportunity", exact: true })
    .click();
  await expect(card.getByLabel("Validation status")).toHaveValue("chosen");
  await card.getByLabel("Validation status").selectOption("testing");
  await card
    .getByLabel("What will you do?")
    .fill("Interview the infrastructure owner.");
  await card.getByRole("button", { name: "Save validation work" }).click();
  await expect(card.getByLabel("Validation status")).toHaveValue("testing");
  await expect(card.getByRole("status")).toContainText("Saved");
  await card
    .getByLabel("What did you learn?")
    .fill("The workflow hurts, but recovery requirements remain unclear.");
  await card.getByLabel("Validation status").selectOption("reviewed");
  await card.getByLabel("Your conclusion").selectOption("inconclusive");
  await card.getByRole("button", { name: "Save validation work" }).click();
  await expect(card.getByLabel("Validation status")).toHaveValue("reviewed");
  await page.reload();
  await expect(card.getByLabel("What did you learn?")).toHaveValue(
    "The workflow hurts, but recovery requirements remain unclear.",
  );
  await page.emulateMedia({ media: "print" });
  const pdf = await readDocument(
    "validation-report.pdf",
    await page.pdf({ format: "A4", printBackground: true }),
  );
  expect(pdf.pages.map((p) => p.text).join("\n")).toContain(
    "recovery requirements remain unclear",
  );
  await page.emulateMedia({ media: "screen" });
  const original = await api(page, "reports/" + rid);
  const markdown = await (
    await page.request.get(`/api/reports/${rid}/export`)
  ).text();
  expect(markdown).toContain("Risks and constraints");
  expect(markdown).toContain("Human-recorded learning");
  expect(markdown).toContain("recovery requirements remain unclear");
  expect((await api(page, "export")).validationWork[0].outcome).toBe(
    "inconclusive",
  );
  await page
    .getByRole("button", { name: "Add more material", exact: true })
    .click();
  await page
    .getByLabel("Or paste customer notes")
    .fill("I would pay for searchable audit history.");
  await page
    .getByRole("button", { name: "Update opportunities", exact: true })
    .click();
  await expect(page).not.toHaveURL(new RegExp(rid + "$"));
  await expect(page.getByLabel("Analysis status")).toContainText("Complete", {
    timeout: 60000,
  });
  await expect(page.getByLabel("Earlier validation work")).toContainText(
    "Make approval changes easier to explain",
    { timeout: 60000 },
  );
  await page
    .getByLabel("Earlier validation work")
    .locator(":scope > summary")
    .click();
  await expect(
    page
      .getByLabel("Earlier validation work")
      .getByLabel("What did you learn?"),
  ).toHaveValue(
    "The workflow hurts, but recovery requirements remain unclear.",
  );
  const updated = await api(page, "reports/" + page.url().split("/").pop());
  expect(updated.validation_work[0].report_id).toBe(rid);
  expect(updated.result.opportunities[0].id).not.toBe(
    original.result.opportunities[0].id,
  );
  await page
    .getByLabel("Earlier validation work")
    .locator(":scope > summary")
    .click();
  const updatedPdf = await readDocument(
    "updated-validation-report.pdf",
    await page.pdf({ format: "A4", printBackground: true }),
  );
  expect(updatedPdf.pages.map((p) => p.text).join("\n")).toContain(
    "recovery requirements remain unclear",
  );
  await expect(page.getByLabel("Earlier validation work")).not.toHaveAttribute(
    "open",
  );
  await page.screenshot({
    path: "test-results/discovery-validation-journey.png",
    fullPage: true,
  });
});

test("partial results offer checkpointed recovery with the same sources and allowance", async ({
  page,
}) => {
  await signup(page);
  await connect(page, "openai", "mock-source-errors");
  const sources = [];
  for (const filename of ["Failed interview.txt", "Good interview.txt"])
    sources.push(
      (
        await api(page, "sources", {
          filename,
          content: filename + "\nWe need audit logs before we can buy.",
        })
      ).sources[0],
    );
  const created = await api(page, "reports", {
    sources: sources.map((s) => ({ id: s.id, role: "customer" })),
  });
  await page.goto("/reports/" + created.id);
  await expect(page.getByLabel("Analysis status")).toContainText(
    "Partial analysis",
    { timeout: 60000 },
  );
  await expect(page.getByLabel("Analysis status")).toContainText(
    "1 of 2 sources fully analyzed",
  );
  await page
    .getByLabel("Analysis warnings")
    .getByText("Review omitted material")
    .click();
  await expect(page.getByLabel("Analysis warnings")).toContainText(
    "Failed interview.txt",
  );
  const original = await api(page, "reports/" + created.id);
  const usage = (await api(page, "flow")).usage;
  await page
    .getByRole("button", { name: "Retry omitted material", exact: true })
    .click();
  await expect(page).not.toHaveURL(new RegExp(created.id + "$"));
  await expect(page.getByLabel("Analysis status")).toContainText("Complete", {
    timeout: 60000,
  });
  await expect(page.getByLabel("Analysis status")).toContainText(
    "2 of 2 sources fully analyzed",
  );
  const recovered = await api(page, "reports/" + page.url().split("/").pop());
  expect(recovered.recovery_of).toBe(created.id);
  expect(recovered.sources.map((s: any) => s.id).sort()).toEqual(
    original.sources.map((s: any) => s.id).sort(),
  );
  expect((await api(page, "reports/" + created.id)).result).toEqual(
    original.result,
  );
  expect((await api(page, "flow")).usage).toEqual(usage);
});

test("analysis readiness prevents importing material after paid access ends", async ({
  page,
}) => {
  await signup(page);
  const user = (await api(page, "flow")).user.id;
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!,
  );
  if (!process.env.TEST_DATABASE_URL) url.pathname += "_e2e";
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query(
      "UPDATE subscriptions SET paid_until=now()-interval '1 day' WHERE user_id=$1",
      [user],
    );
    await page.reload();
    await expect(page.getByLabel("Analysis readiness")).toContainText(
      "Subscribe for $10/month",
    );
    await expect(
      page.getByRole("button", { name: "Find opportunities", exact: true }),
    ).toBeDisabled();
    expect((await api(page, "flow")).sources).toHaveLength(0);
    await expect(
      page.getByRole("link", { name: "Open Settings", exact: true }),
    ).toBeVisible();
  } finally {
    await db.end();
  }
});
