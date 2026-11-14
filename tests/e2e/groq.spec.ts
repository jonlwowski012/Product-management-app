import { test, expect } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { signup, connect, api, completed, seed, testDatabase } from "./helpers";
test("Groq report citations keep company context separate from customer support", async ({
  page,
}) => {
  test.setTimeout(120000);
  await signup(page);
  await connect(page, "groq", "mock-groq-citation-roles");
  const customer = (
    await api(page, "sources", {
      filename: "Customer interview.txt",
      content:
        "We need audit logs before we can buy.\nWe do not need detailed audit history for our three-person team.",
    })
  ).sources[0];
  const context = (
    await api(page, "sources", {
      filename: "Strategy.txt",
      content: "Our internal roadmap says audit logs are important.",
    })
  ).sources[0];
  const report = await api(page, "reports", {
    sources: [
      { id: customer.id, role: "customer" },
      { id: context.id, role: "context" },
    ],
  });
  await expect
    .poll(async () => (await api(page, "reports/" + report.id)).job.state, {
      timeout: 90000,
    })
    .toMatch(/succeeded|failed/);
  const result = await api(page, "reports/" + report.id);
  expect(result.job.state, result.job.error).toBe("succeeded");
  const opportunity = result.result.opportunities[0];
  for (const [ids, stance] of [
    [opportunity.supporting_ids, "supports"],
    [opportunity.opposing_ids, "opposes"],
  ] as const) {
    expect(ids).toHaveLength(1);
    for (const id of ids) {
      const finding = result.result.findings.find((f: any) => f.id === id);
      expect(finding.source_id).toBe(customer.id);
      expect(finding.stance).toBe(stance);
    }
  }
  expect(opportunity.context_ids).toHaveLength(1);
  expect(
    result.result.findings.find((f: any) => f.id === opportunity.context_ids[0])
      .source_id,
  ).toBe(context.id);
});
test("Groq selects verbatim source passages rather than rewriting quotes", async ({
  page,
}) => {
  test.setTimeout(120000);
  await signup(page);
  await connect(page, "groq", "mock-groq-verbatim");
  const content =
    "[00:04] Customer: We need audit logs before we can buy.\n[00:08] Customer: We do not need detailed audit history for our three-person team.";
  const source = (
    await api(page, "sources", { filename: "Verbatim calls.txt", content })
  ).sources[0];
  const report = await api(page, "reports", {
    sources: [{ id: source.id, role: "customer" }],
  });
  await expect
    .poll(async () => (await api(page, "reports/" + report.id)).job.state, {
      timeout: 90000,
    })
    .toMatch(/succeeded|failed/);
  const result = await api(page, "reports/" + report.id);
  expect(result.job.state, result.job.error).toBe("succeeded");
  expect(result.result.findings).toHaveLength(2);
  for (const finding of result.result.findings) {
    expect(
      content.slice(
        finding.source_start,
        finding.source_start + finding.quote.length,
      ),
    ).toBe(finding.quote);
    expect(finding.quote).not.toContain("...");
  }
  expect(result.result.opportunities[0].opposing_ids).toHaveLength(1);
});
test("Groq strict schema batches use Chat Completions instead of the failing Responses protocol", async ({
  page,
}) => {
  await signup(page);
  await connect(page, "groq", "mock-groq-schema-boundary");
  const source = (
    await api(page, "sources", {
      filename: "Customer notes.txt",
      content: "We need audit logs before we can buy.",
    })
  ).sources[0];
  const report = await api(page, "reports", {
    sources: [{ id: source.id, role: "customer" }],
  });
  await expect
    .poll(async () => (await api(page, "reports/" + report.id)).job.state, {
      timeout: 30000,
    })
    .toMatch(/succeeded|failed/);
  const result = await api(page, "reports/" + report.id);
  expect(result.job.state, result.job.error).toBe("succeeded");
  expect(result.result.opportunities).toHaveLength(1);
});
for (const persistent of [false, true]) {
  test(`Groq JSON-generation failures ${persistent ? "stop after bounded retries without leaking provider data" : "retry and recover automatically"}`, async ({
    page,
  }) => {
    test.setTimeout(210000);
    await signup(page);
    await connect(
      page,
      "groq",
      persistent ? "mock-groq-json-error-always" : "mock-groq-json-error",
    );
    const source = await seed(page);
    const job = await api(
      page,
      "transcripts/" + source.transcript + "/extract",
      {},
    );
    const data = await completed(
      page,
      job.id,
      persistent ? "failed" : "succeeded",
      180000,
    );
    const result = data.jobs.find((j: any) => j.id === job.id);
    expect(result.attempts).toBe(persistent ? 3 : 2);
    if (persistent) {
      expect(result.error).toContain("structured response");
      expect(result.error).not.toContain("HTTP 400");
    }
    expect(JSON.stringify(data)).not.toContain("Private provider details");
    expect(JSON.stringify(data)).not.toContain("Private source text");
    expect(JSON.stringify(data)).not.toContain("test-groq-");
  });
}
test("Groq uses its default model, saves its encrypted key, and generates a source-backed report", async ({
  page,
}) => {
  await signup(page);
  await connect(page, "groq");
  await expect(page.getByLabel("Model ID", { exact: true })).toHaveCount(0);
  const catalog = await api(page, "settings/models", { provider: "groq" });
  expect(catalog.models.map((m: any) => m.id)).toEqual([
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
  ]);
  const bootstrap = await api(page, "bootstrap?paged=1");
  expect(bootstrap.settings[0].has_groq_key).toBe(true);
  expect(bootstrap.settings[0]).not.toHaveProperty("groq_key");
  await page.goto("/");
  await expect(page.locator(".flow-reassurance")).toContainText("Groq");
  await page
    .getByLabel("Or paste customer notes")
    .fill("We need audit logs before we can buy.");
  await page
    .getByRole("button", { name: "Find opportunities", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your discovery opportunities",
      exact: true,
    }),
  ).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId("opportunity-card")).toHaveCount(1);
  const data = await api(page, "bootstrap");
  expect(data.jobs[0].provider).toBe("groq");
  expect(data.jobs[0].model).toBe("openai/gpt-oss-20b");
  const exported = await api(page, "export");
  expect(exported.settings).not.toHaveProperty("groq_key");
  expect(JSON.stringify(exported)).not.toContain("test-groq-");
  const calls = await (
    await page.request.get("http://127.0.0.1:3101/__requests")
  ).json();
  const requests = calls.filter(
    (r: any) =>
      r.provider === "groq" &&
      r.model === "openai/gpt-oss-20b" &&
      r.kind === "chat-completions",
  );
  expect(requests.length).toBeGreaterThanOrEqual(2);
  expect(
    requests.every(
      (r: any) =>
        r.max_output_tokens === 2048 &&
        r.strict &&
        r.reasoning.effort === "low",
    ),
  ).toBe(true);
});
test("removing Groq keeps the user's OpenAI key and model selection isolated", async ({
  page,
}) => {
  await signup(page);
  await connect(page, "openai");
  await connect(page, "groq");
  await page
    .getByRole("button", { name: "Remove saved key", exact: true })
    .click();
  await expect(page.getByText("Not connected", { exact: true })).toBeVisible();
  const meta = await api(page, "bootstrap");
  expect(meta.settings.has_groq_key).toBe(false);
  expect(meta.settings.has_openai_key).toBe(true);
  const missing = await page.request.post("/api/settings/models", {
    data: { provider: "groq" },
  });
  expect(missing.status()).toBe(400);
  expect((await missing.json()).error).toContain("Groq API key");
});
test("durable quota waits save their next resume time", async ({ page }) => {
  await signup(page);
  const key = "test-groq-wait-" + randomUUID(),
    model = "openai/gpt-oss-20b";
  await api(
    page,
    "settings",
    { provider: "groq", model, validation_threshold: 1, api_key: key },
    "PATCH",
  );
  const source = await seed(page),
    db = testDatabase();
  await db.connect();
  let jid: string | undefined;
  try {
    const bucket = createHash("sha256")
      .update(key)
      .update("\0")
      .update(model)
      .digest("hex");
    await db.query("INSERT INTO groq_rate_limits(id,state) VALUES($1,$2)", [
      bucket,
      JSON.stringify({ events: [], blockedUntil: Date.now() + 120000 }),
    ]);
    jid = (await api(page, "transcripts/" + source.transcript + "/extract", {}))
      .id;
    await expect
      .poll(async () => {
        const {
          rows: [job],
        } = await db.query(
          "SELECT available_at>now()+interval '30 seconds' AS scheduled FROM jobs WHERE id=$1",
          [jid],
        );
        return job?.scheduled;
      })
      .toBe(true);
  } finally {
    if (jid)
      await db.query("UPDATE jobs SET state='failed' WHERE id=$1", [jid]);
    await db.end();
  }
});
test("Groq honors Retry-After and resumes the same job", async ({ page }) => {
  test.setTimeout(120000);
  await signup(page);
  await connect(page, "groq", "mock-groq-throttle");
  const source = await seed(page);
  const job = await api(
    page,
    "transcripts/" + source.transcript + "/extract",
    {},
  );
  await expect
    .poll(
      async () =>
        (await api(page, "bootstrap")).jobs.find((j: any) => j.id === job.id)
          .state,
      { timeout: 90000 },
    )
    .toBe("succeeded");
  const data = await api(page, "bootstrap");
  expect(data.jobs.find((j: any) => j.id === job.id).attempts).toBe(1);
  const calls = await (
    await page.request.get("http://127.0.0.1:3101/__requests")
  ).json();
  const requests = calls.filter(
    (r: any) => r.provider === "groq" && r.model === "mock-groq-throttle",
  );
  expect(requests).toHaveLength(2);
  expect(requests[1].at - requests[0].at).toBeGreaterThanOrEqual(2900);
});
test("exhausted API credits fail once with billing guidance", async ({
  page,
}) => {
  await signup(page);
  await connect(page, "groq", "mock-quota");
  const source = await seed(page);
  const job = await api(
    page,
    "transcripts/" + source.transcript + "/extract",
    {},
  );
  const data = await completed(page, job.id, "failed");
  const failed = data.jobs.find((j: any) => j.id === job.id);
  expect(failed.attempts).toBe(1);
  expect(failed.error).toContain("billing");
  expect(failed.error).not.toContain("try again shortly");
});
test("Groq token-sized chunks keep long source offsets and private citations intact", async ({
  page,
}) => {
  await signup(page);
  await connect(page, "groq");
  const quote = "We need audit logs before we can buy.";
  const source = (
    await api(page, "sources", {
      filename: "Long customer notes.txt",
      content: "Background customer discussion. ".repeat(250) + quote,
    })
  ).sources[0];
  const report = await api(page, "reports", {
    sources: [{ id: source.id, role: "customer" }],
  });
  await expect
    .poll(async () => (await api(page, "reports/" + report.id)).job.state, {
      timeout: 60000,
    })
    .toBe("succeeded");
  const result = await api(page, "reports/" + report.id);
  expect(result.job.total).toBe(2);
  expect(result.result.findings[0].source_start).toBeGreaterThan(7000);
  expect(result.result.findings[0].quote).toBe(quote);
});
