import { test, expect } from "@playwright/test";
import { signup, connect, api } from "./helpers";
for (const provider of ["groq", "anthropic"] as const)
  test(`${provider}: large reports persist aggregation checkpoints and reuse them after a final-stage failure`, async ({
    page,
  }) => {
    test.setTimeout(240000);
    await signup(page);
    await connect(page, provider, "mock-reduce-checkpoint");
    const quote = "We need audit logs before we can buy.";
    const against =
      "We do not need detailed audit history for our three-person team.";
    const content = (quote + "\n" + against + "\n").repeat(4500);
    const sources = [];
    for (let i = 0; i < 3; i++)
      sources.push(
        (
          await api(page, "sources", {
            filename: `Long call ${i}.txt`,
            content: `Customer ${i}.\n` + content,
          })
        ).sources[0],
      );
    const report = await api(page, "reports", {
      sources: sources.map((s) => ({ id: s.id, role: "customer" })),
    });
    await page.goto("/reports/" + report.id);
    await expect
      .poll(async () => (await api(page, "reports/" + report.id)).job.state, {
        timeout: 180000,
        intervals: [500, 1000],
      })
      .toBe("failed");
    const failed = await api(page, "reports/" + report.id);
    expect(failed.job.completed).toBe(failed.job.total);
    expect(failed.job.total).toBeGreaterThan(provider === "groq" ? 100 : 70);
    expect(failed.job.reduction_completed).toBeGreaterThan(0);
    expect(failed.job.reduction_completed).toBeLessThan(
      failed.job.reduction_total,
    );
    await expect(
      page.getByRole("button", { name: "Retry analysis", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Retry analysis", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Your discovery opportunities",
        exact: true,
      }),
    ).toBeVisible({ timeout: 90000 });
    const finished = await api(page, "reports/" + report.id);
    expect(finished.job.reduction_completed).toBe(finished.job.reduction_total);
    expect(finished.result.coverage.selected_findings).toBeLessThan(
      finished.result.coverage.verified_findings,
    );
    await expect(page.locator(".flow-summary")).toContainText(
      "representative passages",
    );
    const calls = await (
      await page.request.get("http://127.0.0.1:3101/__requests")
    ).json();
    const requests = calls.filter(
      (r: any) =>
        r.model === "mock-reduce-checkpoint" && r.provider === provider,
    );
    expect(
      requests.filter((r: any) => r.schemaKind === "findings"),
    ).toHaveLength(finished.job.total);
    expect(
      requests.filter((r: any) => r.schemaKind === "evidence-selection"),
    ).toHaveLength(finished.job.reduction_total + 1);
    for (const finding of finished.result.findings) {
      const source = await api(
        page,
        "sources/" + finding.source_id + "?page=" + finding.page_index,
      );
      expect(
        source.page.text.slice(
          finding.source_start,
          finding.source_start + finding.quote.length,
        ),
      ).toBe(finding.quote);
    }
  });
