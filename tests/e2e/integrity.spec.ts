import { test, expect } from "@playwright/test";
import { signup, api, seed, manual } from "./helpers";
test("sign out, incorrect credentials, sign in, and reload preserve only the signed-in workspace", async ({
  page,
}) => {
  const email = await signup(page);
  await seed(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.locator("[role=alert]:not(#__next-route-announcer__)"),
  ).toContainText("incorrect");
  await page
    .getByLabel("Password", { exact: true })
    .fill("a-secure-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Turn customer conversations into product opportunities.",
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Turn customer conversations into product opportunities.",
    }),
  ).toBeVisible();
  expect((await api(page, "bootstrap")).customers).toHaveLength(1);
});
test("private records, source downloads, relationship mutations, exports and CSRF are isolated", async ({
  page,
  browser,
}) => {
  await signup(page);
  const a = await seed(page);
  const s = await manual(page, a.customer, a.transcript);
  const f = await api(page, "features", {
    title: "Private feature",
    signal_ids: [s.id],
  });
  const b = await api(page, "briefs", {
    title: "Private brief",
    feature_ids: [f.id],
  });
  const ctx = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  const other = await ctx.newPage();
  await signup(other);
  expect((await api(other, "bootstrap")).customers).toHaveLength(0);
  for (const path of [
    "transcripts/" + a.transcript,
    "transcripts/" + a.transcript + "/download",
  ])
    expect((await other.request.get("/api/" + path)).status()).toBe(404);
  expect(
    (
      await other.request.post("/api/features", {
        data: { title: "Cross-user link", signal_ids: [s.id] },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await other.request.post("/api/briefs", {
        data: { title: "Cross-user brief", feature_ids: [f.id] },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await other.request.post("/api/questions", {
        data: { brief_id: b.id, question: "Foreign question" },
      })
    ).status(),
  ).toBe(404);
  expect(JSON.stringify(await api(other, "export"))).not.toContain(
    "Private feature",
  );
  await other.goto("/transcripts/" + a.transcript);
  await expect(
    other.getByRole("heading", {
      name: "Turn customer conversations into product opportunities.",
    }),
  ).toBeVisible();
  const csrf = await page.request.post("/api/customers", {
    headers: { Origin: "https://untrusted.example" },
    data: { name: "Forged", segment: "SMB" },
  });
  expect(csrf.status()).toBe(403);
  await ctx.close();
});
test("removing source evidence recalculates briefs and invalidates awareness assessments", async ({
  page,
}) => {
  await signup(page);
  const a = await seed(page);
  const s = await manual(page, a.customer, a.transcript);
  const f = await api(page, "features", {
    title: "Audit feature",
    signal_ids: [s.id],
  });
  const b = await api(page, "briefs", {
    title: "Audit bet",
    feature_ids: [f.id],
    signal_ids: [s.id],
  });
  await api(page, "assessments", {
    customer_id: a.customer,
    problem: "Auditability",
    level: 5,
    suggested_level: null,
    business_purpose: "Revenue driver",
    constraints: "",
    buying_authority: "",
    evidence_ids: [s.id],
    confirmed: true,
  });
  await api(page, "transcripts/" + a.transcript, undefined, "DELETE");
  const data = await api(page, "bootstrap");
  expect(data.signals).toHaveLength(0);
  expect(data.assessments[0].confirmed).toBe(false);
  expect(data.assessments[0].evidence_ids).toHaveLength(0);
});
test("fair options and answer completion reject incomplete decisions", async ({
  page,
}) => {
  await signup(page);
  const b = await api(page, "briefs", { title: "Decision guardrails" });
  let data = await api(page, "bootstrap");
  const brief = data.briefs[0];
  const r = await page.request.patch("/api/briefs/" + b.id, {
    data: {
      ...brief,
      signal_ids: [],
      options: [
        { name: "Build", effort: 2, time: "Later", risk: "Unknown" },
        { name: "Do nothing", effort: 1, time: "Now", risk: "Persists" },
      ],
    },
  });
  expect(r.status()).toBe(400);
  const q = await api(page, "questions", {
    brief_id: b.id,
    question: "What remains unknown?",
  });
  const answer = await page.request.patch("/api/questions/" + q.id, {
    data: { in_guide: true, status: "Answered", answer: "" },
  });
  expect(answer.status()).toBe(400);
  await api(
    page,
    "questions/" + q.id,
    { in_guide: true, status: "Open", answer: "" },
    "PATCH",
  );
  await api(
    page,
    "questions/" + q.id,
    { in_guide: true, status: "Open", answer: "" },
    "PATCH",
  );
  data = await api(page, "bootstrap");
  expect(data.questions.filter((q: any) => q.in_guide)).toHaveLength(1);
});
test("withdrawn evidence invalidates a confirmed awareness assessment and can be reviewed again", async ({
  page,
}) => {
  await signup(page);
  const a = await seed(page);
  const s = await manual(page, a.customer, a.transcript);
  await api(page, "assessments", {
    customer_id: a.customer,
    problem: "Budget-ready auditability",
    level: 5,
    suggested_level: null,
    business_purpose: "Revenue driver",
    constraints: "",
    buying_authority: "",
    evidence_ids: [s.id],
    confirmed: true,
  });
  await api(page, "signals/bulk", { ids: [s.id], action: "dismiss" });
  expect((await api(page, "bootstrap")).assessments[0].confirmed).toBe(false);
  const assessment = (await api(page, "bootstrap")).assessments[0];
  const rejected = await page.request.post("/api/assessments", {
    data: { ...assessment, confirmed: true },
  });
  expect(rejected.status()).toBe(400);
});
