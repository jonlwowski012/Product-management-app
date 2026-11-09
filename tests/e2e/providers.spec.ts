import { test, expect } from "@playwright/test";
import { signup, api, connect, seed, completed, manual } from "./helpers";
import { quote } from "../fixtures/transcripts";
for (const provider of ["openai", "anthropic", "groq", "gemini"]) {
  test(`${provider}: connect, extract, preserve human edits, draft, and remove key`, async ({
    page,
  }) => {
    await signup(page);
    await connect(page, provider);
    const s = await seed(page);
    const job = await api(page, "transcripts/" + s.transcript + "/extract", {});
    let data = await completed(page, job.id);
    expect(data.signals).toHaveLength(7);
    expect(data.signals.filter((s: any) => s.verified)).toHaveLength(6);
    expect(data.jobs[0].provider).toBe(provider);
    expect(data.jobs[0].usage[0].input_tokens).toBe(100);
    const sig = data.signals.find((s: any) => s.quote === quote);
    await api(
      page,
      "signals/" + sig.id,
      {
        ...sig,
        title: "Human title survives",
        review: "approved",
        version: sig.version,
      },
      "PATCH",
    );
    const rerun = await api(
      page,
      "transcripts/" + s.transcript + "/extract",
      {},
    );
    data = await completed(page, rerun.id);
    expect(data.signals).toHaveLength(7);
    expect(data.signals.find((s: any) => s.id === sig.id).title).toBe(
      "Human title survives",
    );
    expect(data.signals.find((s: any) => s.id === sig.id).stage).toBe("signal");
    const f = await api(page, "features", {
      title: "Audit capability",
      signal_ids: [sig.id],
    });
    const b = await api(page, "briefs", {
      title: "Audit initiative",
      feature_ids: [f.id],
      signal_ids: [sig.id],
    });
    const drafting = await api(page, "briefs/" + b.id + "/draft", {});
    data = await completed(page, drafting.id);
    const brief = data.briefs.find((x: any) => x.id === b.id);
    expect(brief.ask).toBe("");
    expect(brief.status).toBe("Draft");
    expect(brief.ai_proposal.ask).toContain("audit");
    await page.goto("/settings");
    await page.getByRole("button", { name: "Remove saved key" }).click();
    await expect(
      page.getByText("Not connected", { exact: true }),
    ).toBeVisible();
    const failure = await page.request.post(
      "/api/transcripts/" + s.transcript + "/extract",
      { data: {} },
    );
    expect(failure.status()).toBe(400);
    expect((await failure.json()).error).toContain("API key");
    const exported = await api(page, "export");
    expect(JSON.stringify(exported)).not.toContain("test-" + provider);
    expect(exported.settings).not.toHaveProperty("openai_key");
    expect(exported.settings).not.toHaveProperty("anthropic_key");
    expect(exported.settings).not.toHaveProperty("groq_key");
    expect(exported.settings).not.toHaveProperty("gemini_key");
  });
  for (const [model, message] of [
    ["mock-refusal", "declined"],
    ["mock-incomplete", "incomplete"],
    ["mock-malformed", "validation"],
  ]) {
    test(`${provider}: ${model} fails safely and retry remains available`, async ({
      page,
    }) => {
      await signup(page);
      await connect(page, provider, model);
      const s = await seed(page);
      const accepted = await manual(page, s.customer, s.transcript);
      const job = await api(
        page,
        "transcripts/" + s.transcript + "/extract",
        {},
      );
      let data = await completed(page, job.id, "failed");
      expect(data.jobs[0].error.toLowerCase()).toContain(message);
      expect(data.signals.find((x: any) => x.id === accepted.id).review).toBe(
        "approved",
      );
      await api(
        page,
        "settings",
        {
          provider,
          model:
            provider === "openai"
              ? "gpt-4.1-mini"
              : provider === "groq"
                ? "openai/gpt-oss-20b"
                : provider === "gemini"
                  ? "gemini-3.1-flash-lite"
                  : "claude-sonnet-4-5-20250929",
          validation_threshold: 1,
        },
        "PATCH",
      );
      const retry = await api(page, "jobs/" + job.id + "/retry", {});
      await completed(page, retry.id);
    });
  }
}
test("invalid API keys fail connection validation without replacing saved credentials", async ({
  page,
}) => {
  await signup(page);
  await connect(page);
  await page.getByLabel("Replace API key").fill("invalid-provider-key");
  await page.getByRole("button", { name: "Save connection" }).click();
  await expect(page.locator(".form-error")).toContainText("invalid");
  expect((await api(page, "bootstrap")).settings.has_openai_key).toBe(true);
});
test("transient provider failure retries automatically and succeeds once", async ({
  page,
}) => {
  await signup(page);
  await connect(page, "openai", "mock-transient");
  const s = await seed(page);
  const job = await api(page, "transcripts/" + s.transcript + "/extract", {});
  const data = await completed(page, job.id);
  expect(data.jobs[0].attempts).toBe(2);
  expect(data.signals).toHaveLength(7);
});
test("provider errors stop after the retry budget and expose a recoverable job", async ({
  page,
}) => {
  await signup(page);
  await connect(page, "anthropic", "mock-error");
  const s = await seed(page);
  const job = await api(page, "transcripts/" + s.transcript + "/extract", {});
  const data = await completed(page, job.id, "failed");
  expect(data.jobs[0].attempts).toBe(3);
  expect(data.signals).toHaveLength(0);
});
test("a slow extraction cannot overwrite a simultaneous human review or start duplicate jobs", async ({
  page,
}) => {
  await signup(page);
  await connect(page, "openai", "mock-slow");
  const s = await seed(page);
  await manual(page, s.customer, s.transcript, { review: "pending" });
  let data = await api(page, "bootstrap");
  const sig = data.signals[0];
  const job = await api(page, "transcripts/" + s.transcript + "/extract", {});
  const duplicate = await page.request.post(
    "/api/transcripts/" + s.transcript + "/extract",
    { data: {} },
  );
  expect(duplicate.status()).toBe(409);
  await api(
    page,
    "signals/" + sig.id,
    {
      ...sig,
      title: "Edited during extraction",
      review: "approved",
      version: sig.version,
    },
    "PATCH",
  );
  data = await completed(page, job.id);
  const after = data.signals.find((x: any) => x.id === sig.id);
  expect(after.title).toBe("Edited during extraction");
  expect(after.review).toBe("approved");
  expect(after.edited.title).toBe(true);
});
