import { test, expect } from "@playwright/test";
import { signup, api, connect } from "./helpers";

test("gemini: free model setup and discovery use Google's chat endpoint and preserve key privacy", async ({
  page,
}) => {
  await signup(page);
  await connect(page, "gemini");
  const catalog = await api(page, "settings/models", { provider: "gemini" });
  expect(catalog.models.map((m: { id: string }) => m.id)).toEqual([
    "gemini-2.5-flash",
    "gemini-3.1-flash-lite",
  ]);
  await connect(page, "gemini", "mock-gemini-semantic-retry");
  const meta = await api(page, "flow");
  expect(meta.hasOwnKey).toBe(true);
  expect(meta.analysisProvider).toBe("gemini");
  const source = await api(page, "sources", {
    filename: "Fictional interview.txt",
    content:
      "We need audit logs before we can buy.\nWe do not need detailed audit history for our three-person team.",
  });
  const report = await api(page, "reports", {
    question: "What is delaying adoption?",
    sources: [{ id: source.sources[0].id, role: "customer" }],
  });
  await expect
    .poll(async () => (await api(page, "reports/" + report.id)).job.state, {
      timeout: 30000,
    })
    .toBe("succeeded");
  const calls = await (
    await page.request.get("http://127.0.0.1:3101/__requests")
  ).json();
  const request = calls.find(
    (r: any) => r.provider === "gemini" && r.schemaKind === "report",
  );
  expect(request).toBeTruthy();
  expect(request.schemaHasPositiveMaximums).toBe(false);
  expect(request.strict).toBe(true);
  expect(request.groundedReportCitations).toBe(true);
  expect(request.supportingMinItems).toBe(1);
  expect(request.contextMaxItems).toBe(0);
  const result = await api(page, "reports/" + report.id);
  expect(result.result.opportunities).toHaveLength(1);
  expect(result.job.attempts).toBe(2);
  expect(result.result.opportunities[0].context_ids).toEqual([]);
  expect(result.result.opportunities[0].opposing_ids).not.toContain(
    result.result.opportunities[0].supporting_ids[0],
  );
  const workspace = await api(page, "bootstrap");
  expect(workspace.settings.has_gemini_key).toBe(true);
  expect(workspace.settings).not.toHaveProperty("gemini_key");
  const paged = await api(page, "bootstrap?paged=1");
  expect(paged.settings[0].has_gemini_key).toBe(true);
  expect((await api(page, "export")).settings).not.toHaveProperty("gemini_key");
  await page.goto("/reports/" + report.id);
  await expect(
    page.getByRole("heading", {
      name: "Your discovery opportunities",
      exact: true,
    }),
  ).toBeVisible();
});
