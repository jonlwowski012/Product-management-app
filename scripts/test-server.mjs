import "dotenv/config";
import pg from "pg";
import { createHash } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { mockBlob } from "./mock-blob.mjs";
import { mockProvider } from "./mock-provider.mjs";
const url = new URL(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
if (!process.env.TEST_DATABASE_URL) url.pathname = url.pathname + "_e2e";
const name = url.pathname.slice(1);
if (!/^[a-zA-Z0-9_]+_e2e$/.test(name))
  throw new Error("Test database name must end in _e2e");
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [
  name,
]);
if (!exists.rowCount) await admin.query(`CREATE DATABASE "${name}"`);
await admin.end();
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
await db.query(
  (await readFile(new URL("../lib/schema.sql", import.meta.url), "utf8")) +
    "\n" +
    (await readFile(new URL("../lib/hosting.sql", import.meta.url), "utf8")) +
    "\n" +
    (await readFile(new URL("../lib/demo.sql", import.meta.url), "utf8")) +
    "\n" +
    (await readFile(new URL("../lib/workflow.sql", import.meta.url), "utf8")) +
    "\n" +
    (await readFile(new URL("../lib/groq.sql", import.meta.url), "utf8")) +
    "\n" +
    (await readFile(
      new URL("../lib/bulk-discovery.sql", import.meta.url),
      "utf8",
    )) +
    "\n" +
    (await readFile(
      new URL("../lib/workflow-capacity.sql", import.meta.url),
      "utf8",
    )) +
    "\n" +
    (await readFile(
      new URL("../lib/groq-rate-limits.sql", import.meta.url),
      "utf8",
    )) +
    "\n" +
    (await readFile(
      new URL("../lib/analysis-warnings.sql", import.meta.url),
      "utf8",
    )) +
    "\n" +
    (await readFile(new URL("../lib/gemini.sql", import.meta.url), "utf8")) +
    "\n" +
    (await readFile(new URL("../lib/research.sql", import.meta.url), "utf8")) +
    "\n" +
    (await readFile(
      new URL("../lib/discovery-experience.sql", import.meta.url),
      "utf8",
    )) +
    "\n" +
    (await readFile(
      new URL("../lib/commercial.sql", import.meta.url),
      "utf8",
    )) +
    "\n" +
    (await readFile(
      new URL("../lib/commercial-review.sql", import.meta.url),
      "utf8",
    )) +
    "\n" +
    (await readFile(
      new URL("../lib/commercial-concurrency.sql", import.meta.url),
      "utf8",
    )),
);
// Authentication limits belong to this isolated test run.
await db.query("DELETE FROM auth_attempts");
// The Blob HTTP double is empty on every run; rebuild only the demo fixture.
await db.query("DELETE FROM demo_dataset");
await db.end();
await mkdir(".local/e2e-data", { recursive: true });
const rateClock = new pg.Pool({ connectionString: url.toString(), max: 2 });
const mock = await mockProvider(3101, async ({ provider, key, model }) => {
  if (
    provider !== "groq" ||
    (model !== "mock-reduce-checkpoint" &&
      !model.startsWith("mock-source-errors"))
  )
    return;
  // Advance only these fixtures' quota clock; dedicated rate-limit tests use real time.
  const id = createHash("sha256")
    .update(key)
    .update("\0")
    .update(model)
    .digest("hex");
  await rateClock.query(
    `UPDATE groq_rate_limits SET state=jsonb_set(state,'{events}',
    coalesce((SELECT jsonb_agg(e || jsonb_build_object('at',(e->>'at')::numeric-60001))
    FROM jsonb_array_elements(state->'events') e),'[]'::jsonb)) WHERE id=$1`,
    [id],
  );
});
const blob = await mockBlob();
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  DIRECT_DATABASE_URL: url.toString(),
  APP_SECRET: "e2e-only-secret-not-for-real-use-1234567890",
  APP_URL: "http://127.0.0.1:3100",
  PORT: "3100",
  DATA_DIR: ".local/e2e-data",
  INCLUDED_AI_API_KEY: "e2e-included-key",
  INCLUDED_AI_MODEL: "gpt-4.1-mini",
  INCLUDED_AI_PROVIDER: "openai",
  E2E_TEST_MODE: "1",
  E2E_PROVIDER_BASE_URL: "http://127.0.0.1:3101",
  COOKIE_SECURE: "false",
  JOB_RUNNER: "workflow",
  WORKFLOW_TARGET_WORLD: "local",
  WORKFLOW_LOCAL_BASE_URL: "http://127.0.0.1:3100",
  WORKFLOW_LOCAL_DATA_DIR:
    process.env.WORKFLOW_LOCAL_DATA_DIR ?? ".local/workflow-e2e",
  WORKFLOW_LOCAL_QUEUE_CONCURRENCY: "2",
  CRON_SECRET: "e2e-maintenance-secret",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_e2estore_test-secret",
  VERCEL_BLOB_API_URL: "http://127.0.0.1:3102",
  NEXT_PUBLIC_VERCEL_BLOB_API_URL: "http://127.0.0.1:3102",
  VERCEL_BLOB_CALLBACK_URL: "http://127.0.0.1:3100",
  WATCHPACK_POLLING: "true",
};
await new Promise((resolve, reject) => {
  const seed = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/seed-demo.ts"],
    { env, stdio: "inherit" },
  );
  seed.on("exit", (code) =>
    code === 0 ? resolve() : reject(new Error("Demo seed failed")),
  );
  seed.on("error", reject);
});
const children = [
  spawn(
    "node",
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--webpack",
      "--port",
      "3100",
      "--hostname",
      "127.0.0.1",
    ],
    { env, stdio: "inherit" },
  ),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  mock.close();
  void rateClock.end();
  blob.close();
  children.forEach((c) => c.kill("SIGTERM"));
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
children.forEach((c) =>
  c.on("exit", (code) => {
    stop();
    process.exitCode = code ?? 0;
  }),
);
// Warm API/Workflow modules before opening Chrome: first compilation can trigger
// Next's dev reload, which would otherwise interrupt a direct browser upload.
let ready = false;
for (let attempt = 0; attempt < 120; attempt++) {
  try {
    if ((await fetch("http://127.0.0.1:3100")).ok) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (!ready) throw new Error("Test app did not start");
for (const route of ["uploads/reserve", "uploads/token", "uploads/complete"]) {
  await fetch("http://127.0.0.1:3100/api/" + route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}
await fetch("http://127.0.0.1:3100/api/bootstrap?paged=1");
await fetch("http://127.0.0.1:3100/api/maintenance");
await fetch("http://127.0.0.1:3100/.well-known/workflow/v1/flow", {
  method: "HEAD",
});
const { createServer } = await import("node:http");
const readiness = createServer((_req, res) => res.end("ready"));
await new Promise((resolve) => readiness.listen(3103, "127.0.0.1", resolve));
process.on("SIGTERM", () => readiness.close());
process.on("SIGINT", () => readiness.close());
