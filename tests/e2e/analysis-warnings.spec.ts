import { test, expect } from "@playwright/test";
import { signup, connect, api } from "./helpers";

for (const provider of ["groq", "openai"] as const) {
  test(`${provider}: failed documents warn while other documents finish`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await signup(page);
    await connect(page, provider, "mock-source-errors");
    const sources = [];
    for (const filename of [
      "Failed interview.txt",
      "Failed research.txt",
      "Good interview.txt",
    ])
      sources.push(
        (
          await api(page, "sources", {
            filename,
            content: `${filename}\nWe need audit logs before we can buy.`,
          })
        ).sources[0],
      );
    const created = await api(page, "reports", {
      sources: sources.map((s) => ({ id: s.id, role: "customer" })),
    });
    await page.goto("/reports/" + created.id);
    await expect(
      page.getByRole("heading", {
        name: "Your discovery opportunities",
        exact: true,
      }),
    ).toBeVisible({ timeout: 90000 });
    const report = await api(page, "reports/" + created.id);
    expect(report.job.state).toBe("succeeded");
    expect(report.job.attempts).toBe(1);
    expect(report.job.completed).toBe(3);
    expect(report.analysis_warnings).toHaveLength(2);
    expect(report.result.analysis_warnings).toEqual(report.analysis_warnings);
    expect(report.result.coverage.analyzed_sources).toBe(1);
    expect(report.result.coverage.skipped_batches).toBe(2);
    expect(report.result.findings).toHaveLength(1);
    expect(report.result.findings[0].source_id).toBe(sources[2].id);
    const warnings = page.getByLabel("Analysis warnings");
    await expect(warnings).toBeVisible();
    await warnings.getByText("Review omitted material").click();
    await expect(warnings).toContainText("Failed interview.txt");
    await expect(warnings).toContainText("Failed research.txt");
    await page.reload();
    await expect(page.getByLabel("Analysis warnings")).toBeVisible();
    const markdown = await (
      await page.request.get(`/api/reports/${created.id}/export`)
    ).text();
    expect(markdown).toContain("Analysis warnings");
    expect(markdown).toContain("Failed interview.txt");
    expect(JSON.stringify(report) + markdown).not.toContain(
      "Private provider details",
    );
    expect(JSON.stringify(report) + markdown).not.toContain(
      "Private source text",
    );

    // Failed source material is retried when carrying the report forward.
    const updated = await api(page, "reports", {
      parent_id: created.id,
      question: "Recheck omitted interviews",
      sources: sources.map((s) => ({ id: s.id, role: "customer" })),
    });
    await expect
      .poll(async () => (await api(page, "reports/" + updated.id)).job.state, {
        timeout: 30000,
      })
      .toBe("succeeded");
    const recovered = await api(page, "reports/" + updated.id);
    expect(recovered.analysis_warnings).toEqual([]);
    expect(recovered.result.coverage.analyzed_sources).toBe(3);
    expect(recovered.result.findings).toHaveLength(3);
  });
}

test("all failed documents preserve warnings and can be retried", async ({
  page,
}) => {
  test.setTimeout(120000);
  await signup(page);
  await connect(page, "groq", "mock-source-errors");
  const source = (
    await api(page, "sources", {
      filename: "Failed interview.txt",
      content: "We need audit logs before we can buy.",
    })
  ).sources[0];
  const created = await api(page, "reports", {
    sources: [{ id: source.id, role: "customer" }],
  });
  await page.goto("/reports/" + created.id);
  await expect(
    page.getByRole("heading", { name: "Your analysis needs attention" }),
  ).toBeVisible({ timeout: 90000 });
  const failed = await api(page, "reports/" + created.id);
  expect(failed.result).toBeNull();
  expect(failed.analysis_warnings).toHaveLength(1);
  await expect(page.getByLabel("Analysis warnings")).toBeVisible();
  await page
    .getByRole("button", { name: "Retry analysis", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your discovery opportunities",
      exact: true,
    }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByLabel("Analysis warnings")).toHaveCount(0);
  const recovered = await api(page, "reports/" + created.id);
  expect(recovered.result.coverage.skipped_batches).toBe(0);
  expect(recovered.result.findings).toHaveLength(1);
});
