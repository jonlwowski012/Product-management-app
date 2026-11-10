import { test, expect, Page } from "@playwright/test";
import { signup, api, seed } from "./helpers";
import { DEMO_USER_ID, DEMO_EMAIL, demoId } from "../../lib/demo-constants";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";
import "dotenv/config";
test.describe.configure({ mode: "serial" });
function connection() {
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!,
  );
  if (!process.env.TEST_DATABASE_URL) url.pathname += "_e2e";
  return url.toString();
}
async function enter(page: Page) {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Explore demo", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Your discovery opportunities",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Demo workspace notice")).toContainText(
    "Anonymized data",
  );
}
async function snapshot(page: Page) {
  const response = await page.request.get("/api/demo/bootstrap");
  expect(response.ok()).toBe(true);
  return response.json();
}

test("demo reports and settings stay simple and read only", async ({
  page,
}) => {
  const providerRequests: string[] = [];
  page.on("request", (r) => {
    if (/settings\/(models|test)|\/extract$|\/draft$/.test(r.url()))
      providerRequests.push(r.url());
  });
  await enter(page);
  await expect(page.getByTestId("opportunity-card")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Add more material", exact: true }),
  ).toBeDisabled();
  await page.goto("/demo/executive");
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByTestId("opportunity-card")).toHaveCount(3);
  await page.goto("/demo/settings");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("AI provider", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Export my data" }),
  ).toHaveAttribute("href", "/api/demo/export");
  const exported = await page.request.get("/api/demo/export");
  const data = await exported.json();
  expect(data.transcripts).toHaveLength(0);
  expect(data.sources).toHaveLength(6);
  expect(providerRequests).toEqual([]);
});

test("demo API rejects writes, uploads and provider calls while keeping reads scoped", async ({
  page,
}) => {
  await enter(page);
  const before = await snapshot(page);
  const writes: [string, string][] = [
    ["PATCH", "settings"],
    ["DELETE", "settings/openai"],
    ["POST", "settings/test"],
    ["POST", "settings/models"],
    ["POST", "customers"],
    ["PATCH", "customers/" + demoId(100)],
    ["POST", "products"],
    ["POST", "transcripts"],
    ["DELETE", "transcripts/" + demoId(200)],
    ["POST", "transcripts/" + demoId(200) + "/extract"],
    ["POST", "signals"],
    ["PATCH", "signals/" + demoId(300)],
    ["POST", "features"],
    ["PATCH", "features/" + demoId(400)],
    ["POST", "briefs"],
    ["PATCH", "briefs/" + demoId(500)],
    ["POST", "briefs/" + demoId(500) + "/draft"],
    ["POST", "questions"],
    ["POST", "assessments"],
    ["POST", "curation"],
    ["POST", "jobs/" + demoId(800) + "/retry"],
    ["POST", "reports/" + demoId(900) + "/retry-omitted"],
    ["PATCH", "reports/" + demoId(900) + "/validation/" + "a".repeat(32)],
    ["POST", "uploads/reserve"],
    ["POST", "uploads/token"],
    ["POST", "uploads/complete"],
    ["POST", "auth/register"],
    ["POST", "auth/login"],
  ];
  for (const [method, path] of writes) {
    const response = await page.request.fetch("/api/demo/" + path, {
      method,
      data: {},
    });
    expect(response.status(), method + " " + path).toBe(403);
    expect((await response.json()).error).toContain("read only");
  }
  expect(await snapshot(page)).toEqual(before);
  expect((await page.request.get("/api/bootstrap")).status()).toBe(401);
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "evidence_demo_session",
  )!;
  await page.context().addCookies([{ ...cookie, name: "evidence_session" }]);
  expect((await page.request.get("/api/bootstrap")).status()).toBe(401);
  for (const path of ["reserve", "token", "complete"])
    expect(
      (
        await page.request.post("/api/uploads/" + path, {
          data: {
            type: "blob.generate-client-token",
            payload: { pathname: "forbidden", clientPayload: demoId(1) },
          },
        })
      ).status(),
    ).toBeGreaterThanOrEqual(400);
});

test("personal sessions and records remain separate when entering and leaving the demo", async ({
  page,
}) => {
  await signup(page);
  const personal = await seed(page);
  const privateName = (await api(page, "bootstrap")).customers[0].name;
  const personalCookie = (await page.context().cookies()).find(
    (c) => c.name === "evidence_session",
  )!.value;
  await enter(page);
  expect(JSON.stringify(await snapshot(page))).not.toContain(privateName);
  expect(
    (
      await page.request.get(
        "/api/demo/transcripts/" + personal.transcript + "/download",
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.get("/api/transcripts/" + demoId(200) + "/download")
    ).status(),
  ).toBe(404);
  await page.getByRole("button", { name: "Exit demo", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", {
      name: "Turn customer conversations into product opportunities.",
    }),
  ).toBeVisible();
  expect(
    (await page.context().cookies()).find((c) => c.name === "evidence_session")!
      .value,
  ).toBe(personalCookie);
  expect((await api(page, "bootstrap")).customers[0].name).toBe(privateName);
  expect(
    (await page.context().cookies()).some(
      (c) => c.name === "evidence_demo_session",
    ),
  ).toBe(false);
});

test("visitors have independent sessions, expiry is enforced, and signup starts empty", async ({
  page,
  browser,
}) => {
  await enter(page);
  const first = (await page.context().cookies()).find(
    (c) => c.name === "evidence_demo_session",
  )!;
  expect(first.httpOnly).toBe(true);
  expect(first.sameSite).toBe("Lax");
  expect(first.expires - Date.now() / 1000).toBeLessThanOrEqual(7200);
  expect((await page.request.post("/api/auth/demo", { data: {} })).ok()).toBe(
    true,
  );
  expect(
    (await page.context().cookies()).find(
      (c) => c.name === "evidence_demo_session",
    )!.value,
  ).toBe(first.value);
  const second = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const db = new pg.Client({ connectionString: connection() });
  await db.connect();
  try {
    const other = await second.newPage();
    await enter(other);
    expect(
      (await second.cookies()).find((c) => c.name === "evidence_demo_session")!
        .value,
    ).not.toBe(first.value);
    await db.query(
      "UPDATE sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
      [createHash("sha256").update(first.value).digest("hex")],
    );
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Explore demo", exact: true }),
    ).toBeVisible();
    expect((await other.request.get("/api/demo/bootstrap")).ok()).toBe(true);
    await other
      .getByRole("link", { name: "Create my workspace", exact: true })
      .click();
    await signup(other);
    const own = await api(other, "bootstrap");
    expect(own.user.is_demo).toBe(false);
    expect(own.customers).toHaveLength(0);
    expect(own.transcripts).toHaveLength(0);
    expect(own.signals).toHaveLength(0);
  } finally {
    await db.end();
    await second.close();
  }
});

test("seed is repeatable and all accepted source quotes match stored originals", async ({
  page,
}) => {
  await enter(page);
  const before = await snapshot(page);
  const seeded = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/seed-demo.ts"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: connection(),
        DIRECT_DATABASE_URL: connection(),
      },
    },
  );
  expect(seeded.status, seeded.stderr).toBe(0);
  expect(JSON.parse(seeded.stdout).changed).toBe(false);
  expect(await snapshot(page)).toEqual(before);
  const report = await api(page, "demo/reports/" + demoId(1000));
  expect(report.question).toBe(
    "Is simulation as a service a good product idea?",
  );
  expect(report.result.coverage).toMatchObject({
    sources: 6,
    analyzed_sources: 2,
    verified_findings: 45,
    selected_findings: 10,
    skipped_batches: 10,
  });
  expect(report.result.analysis_warnings).toHaveLength(10);
  expect(report.result.opportunities.map((o: any) => o.title)).toEqual([
    "API-First, Ephemeral Simulation Infrastructure",
    "Integrated Simulation-to-Training Pipeline",
    "Modular Entry Points to Build Trust",
  ]);
  for (const finding of report.result.findings) {
    const source = await api(page, "demo/sources/" + finding.source_id);
    expect(
      source.page.text.slice(
        finding.source_start,
        finding.source_start + finding.quote.length,
      ),
    ).toBe(finding.quote);
    const download = await page.request.get(
      "/api/demo/sources/" + finding.source_id + "/download",
    );
    expect(download.ok()).toBe(true);
    expect(await download.text()).toContain("Selected excerpts only");
  }
  const first = report.result.opportunities[0];
  expect(
    new Set(
      first.supporting_ids.map(
        (id: string) =>
          report.result.findings.find((f: any) => f.id === id).source_id,
      ),
    ).size,
  ).toBe(2);
  expect(first.opposing_ids).toHaveLength(2);
  await page.screenshot({
    path: ".local/simulation-demo-desktop.png",
    fullPage: true,
  });
  await page
    .getByTestId("opportunity-card")
    .first()
    .locator(".flow-evidence > summary")
    .click();
  const quote = report.result.findings.find(
    (f: any) => f.id === first.supporting_ids[0],
  );
  await page
    .getByTestId("opportunity-card")
    .first()
    .locator(".flow-citation")
    .first()
    .getByRole("button")
    .click();
  await expect(page.getByRole("dialog").locator("mark")).toHaveText(
    quote.quote,
  );
  await expect(page.getByRole("dialog")).toContainText(
    "Selected excerpts only",
  );
  await page.screenshot({
    path: ".local/simulation-demo-source.png",
    fullPage: true,
  });
});

test("upgrading the demo retires only demo files and preserves personal data and sessions", async ({
  page,
}) => {
  await signup(page);
  await seed(page);
  const personal = await api(page, "bootstrap");
  await enter(page);
  const session = (await page.context().cookies()).find(
    (c) => c.name === "evidence_demo_session",
  )!.value;
  const db = new pg.Client({ connectionString: connection() });
  const retired = "/tmp/evidence-retired-demo-" + randomUUID();
  await db.connect();
  try {
    await db.query(
      "INSERT INTO transcripts(id,user_id,customer_id,title,filename,sha256,raw_text,segments,storage_path) VALUES($1,$2,$3,'Old demo interview','old-demo.txt',$4,'Old sample transcript.','[]',$5)",
      [demoId(200), DEMO_USER_ID, demoId(100), randomUUID(), retired],
    );
    await db.query(
      "INSERT INTO features(id,user_id,title) VALUES($1,$2,'Old demo feature')",
      [demoId(400), DEMO_USER_ID],
    );
    await db.query(
      "INSERT INTO briefs(id,user_id,title) VALUES($1,$2,'Old demo brief')",
      [demoId(500), DEMO_USER_ID],
    );
    await db.query(
      "INSERT INTO signals(id,user_id,customer_id,transcript_id,source_key,title,quote) VALUES($1,$2,$3,$4,'old-demo','Old sample signal','Old sample transcript.')",
      [demoId(300), DEMO_USER_ID, demoId(100), demoId(200)],
    );
    await db.query(
      "INSERT INTO feature_signals(user_id,feature_id,signal_id) VALUES($1,$2,$3)",
      [DEMO_USER_ID, demoId(400), demoId(300)],
    );
    await db.query(
      "INSERT INTO brief_features(user_id,brief_id,feature_id) VALUES($1,$2,$3)",
      [DEMO_USER_ID, demoId(500), demoId(400)],
    );
    await db.query(
      "INSERT INTO brief_signals(user_id,brief_id,signal_id) VALUES($1,$2,$3)",
      [DEMO_USER_ID, demoId(500), demoId(300)],
    );
    await db.query(
      "INSERT INTO jobs(id,user_id,transcript_id,brief_id,purpose,provider,model,state) VALUES($1,$2,$3,$4,'extract','openai','prerecorded-example','succeeded')",
      [demoId(800), DEMO_USER_ID, demoId(200), demoId(500)],
    );
    await db.query(
      "UPDATE demo_dataset SET version='previous-demo-fixture' WHERE user_id=$1",
      [DEMO_USER_ID],
    );
    const upgraded = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/seed-demo.ts"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: connection(),
          DIRECT_DATABASE_URL: connection(),
        },
      },
    );
    expect(upgraded.status, upgraded.stderr).toBe(0);
    expect(JSON.parse(upgraded.stdout).changed).toBe(true);
    for (const table of [
      "jobs",
      "transcripts",
      "signals",
      "features",
      "briefs",
      "feature_signals",
      "brief_features",
      "brief_signals",
    ])
      expect(
        (
          await db.query(`SELECT * FROM ${table} WHERE user_id=$1`, [
            DEMO_USER_ID,
          ])
        ).rowCount,
        table,
      ).toBe(0);
    expect(
      (
        await db.query(
          "SELECT pathname FROM storage_deletions WHERE pathname=$1",
          [retired],
        )
      ).rowCount,
    ).toBe(1);
    expect(await api(page, "bootstrap")).toEqual(personal);
    await page.reload();
    await expect(page.getByTestId("opportunity-card")).toHaveCount(3);
    expect(
      (await page.context().cookies()).find(
        (c) => c.name === "evidence_demo_session",
      )!.value,
    ).toBe(session);
  } finally {
    await db.query("DELETE FROM storage_deletions WHERE pathname=$1", [
      retired,
    ]);
    await db.end();
  }
});

test("demo browsing and background recovery cannot dispatch AI or accept demo credentials", async ({
  page,
}) => {
  await enter(page);
  const db = new pg.Client({ connectionString: connection() });
  const job = randomUUID();
  await db.connect();
  try {
    await db.query(
      "INSERT INTO jobs(id,user_id,report_id,purpose,provider,model) VALUES($1,$2,$3,'analyze','openai','should-never-run')",
      [job, DEMO_USER_ID, demoId(1000)],
    );
    await snapshot(page);
    const code = `import assert from 'node:assert/strict'; import { dispatchJob, recoverJobs } from './lib/dispatch.ts'; import { enqueue } from './lib/jobs.ts'; import { credentials } from './lib/ai.ts'; import { prepareJob } from './lib/job-engine.ts'; import { pool } from './lib/db.ts'; await dispatchJob('${job}'); assert.equal(await recoverJobs('${DEMO_USER_ID}'),0); await assert.rejects(()=>enqueue('${DEMO_USER_ID}','extract','${demoId(201)}'),/read only/); await assert.rejects(()=>credentials('${DEMO_USER_ID}','openai'),/read only/); await assert.rejects(()=>prepareJob('${job}'),/read only/); await pool.end();`;
    const checked = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", code],
      { encoding: "utf8", env: { ...process.env, DATABASE_URL: connection() } },
    );
    expect(checked.status, checked.stderr).toBe(0);
    const {
      rows: [record],
    } = await db.query(
      "SELECT state,workflow_run_id,dispatch_token,attempts FROM jobs WHERE id=$1",
      [job],
    );
    expect(record).toEqual({
      state: "queued",
      workflow_run_id: null,
      dispatch_token: null,
      attempts: 0,
    });
  } finally {
    await db.query("DELETE FROM jobs WHERE id=$1", [job]);
    await db.end();
  }
});

test("public demo entry is rate limited, rejects cross-origin requests, and has no password login", async ({
  request,
}) => {
  const cross = await request.post("/api/auth/demo", {
    headers: { origin: "https://untrusted.invalid" },
    data: {},
  });
  expect(cross.status()).toBe(403);
  const login = await request.post("/api/auth/login", {
    data: { email: DEMO_EMAIL, password: "not-a-public-password" },
  });
  expect(login.status()).toBe(401);
  const address = "demo-limit-" + randomUUID();
  const identity =
    "demo:" +
    createHmac("sha256", "e2e-only-secret-not-for-real-use-1234567890")
      .update(address)
      .digest("hex");
  const db = new pg.Client({ connectionString: connection() });
  await db.connect();
  try {
    await db.query(
      "INSERT INTO auth_attempts(identity) SELECT $1 FROM generate_series(1,120)",
      [identity],
    );
    const limited = await request.post("/api/auth/demo", {
      headers: { "x-real-ip": address },
      data: {},
    });
    expect(limited.status()).toBe(429);
    expect((await limited.json()).error).toContain("Too many demo sessions");
  } finally {
    await db.query("DELETE FROM auth_attempts WHERE identity=$1", [identity]);
    await db.end();
  }
});
