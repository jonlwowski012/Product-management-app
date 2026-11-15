import { test, expect } from "@playwright/test";
import { api, signup } from "./helpers";

test("homepage explains transcript handling and links to privacy details", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const section = page.getByRole("region", {
    name: "How we handle your transcripts",
  });
  await expect(section).toContainText("Private by default");
  await expect(section).toContainText(
    "provider’s retention and training settings apply",
  );
  await expect(
    section.getByRole("link", { name: "Privacy and data handling" }),
  ).toHaveAttribute("href", "/privacy");
});

test("transcript deletion is private and removes affected reports while keeping other sources", async ({
  page,
  browser,
}) => {
  test.setTimeout(150000);
  await signup(page);
  const {
    sources: [source],
  } = await api(page, "sources", {
    filename: "Interview to remove.txt",
    content: "We need audit logs before we can buy.",
  });
  const {
    sources: [keep],
  } = await api(page, "sources", {
    filename: "Keep interview.txt",
    content: "I would pay for searchable audit history.",
  });
  const first = await api(page, "reports", {
    sources: [{ id: source.id, role: "customer" }],
  });
  await expect
    .poll(async () => (await api(page, "reports/" + first.id)).job.state, {
      timeout: 45000,
    })
    .toBe("succeeded");
  const child = await api(page, "reports", {
    sources: [{ id: keep.id, role: "customer" }],
    parent_id: first.id,
  });
  await expect
    .poll(async () => (await api(page, "reports/" + child.id)).job.state, {
      timeout: 45000,
    })
    .toBe("succeeded");
  expect(
    (
      await page.request.get("/api/sources/" + source.id + "/download")
    ).status(),
  ).toBe(200);

  const context = await browser.newContext();
  try {
    const outsider = await context.newPage();
    await signup(outsider);
    expect(JSON.stringify(await api(outsider, "export"))).not.toContain(
      "We need audit logs before we can buy.",
    );
    for (const url of [
      "sources/" + source.id,
      "sources/" + source.id + "/download",
      "sources/" + source.id + "/deletion-impact",
      "reports/" + first.id,
    ]) {
      expect(
        (await outsider.request.get("/api/" + url, { maxRetries: 1 })).status(),
      ).toBe(404);
    }
    expect(
      (
        await outsider.request.delete("/api/sources/" + source.id, {
          data: { reportIds: [first.id, child.id] },
        })
      ).status(),
    ).toBe(404);
  } finally {
    await context.close();
  }

  await page.goto("/?new=1");
  await page
    .getByText("Choose from saved material (2)", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "View Interview to remove.txt" })
    .click();
  await page
    .getByRole("button", { name: "Delete transcript", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("2 affected reports");
  await page
    .getByRole("button", { name: "Permanently delete transcript", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Private file cleanup is complete.",
    { timeout: 15000 },
  );
  await page.getByRole("link", { name: "Back to Discovery" }).click();
  expect(
    (
      await page.request.get("/api/sources/" + source.id + "/download", {
        maxRetries: 1,
      })
    ).status(),
  ).toBe(404);
  for (const id of [first.id, child.id])
    expect(
      (
        await page.request.get("/api/reports/" + id, { maxRetries: 1 })
      ).status(),
    ).toBe(404);
  expect(
    (await api(page, "flow")).sources.map((s: { id: string }) => s.id),
  ).toEqual([keep.id]);
  expect(
    JSON.stringify(await api(page, "library/signals?view=all")),
  ).not.toContain("We need audit logs before we can buy.");
  expect(JSON.stringify(await api(page, "export"))).not.toContain(
    "We need audit logs before we can buy.",
  );
});
