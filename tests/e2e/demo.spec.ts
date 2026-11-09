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
    "Fictional data",
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
  expect((await exported.json()).transcripts).toHaveLength(12);
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
  for (const t of before.transcripts) {
    const source = await page.request.get("/api/demo/transcripts/" + t.id);
    const raw = (await source.json()).raw_text;
    for (const signal of before.signals.filter(
      (s: any) => s.transcript_id === t.id && s.verified,
    ))
      expect(raw.slice(signal.source_start, signal.source_end)).toBe(
        signal.quote,
      );
  }
  expect(
    before.features.find((f: any) => f.title === "Scheduled report exports")
      .metrics.mixed,
  ).toBe(1);
  expect(
    before.features.find(
      (f: any) => f.title === "Predictive staffing forecasts",
    ).metrics.for,
  ).toBe(0);
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
      "INSERT INTO jobs(id,user_id,transcript_id,purpose,provider,model) VALUES($1,$2,$3,'extract','openai','should-never-run')",
      [job, DEMO_USER_ID, demoId(201)],
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
