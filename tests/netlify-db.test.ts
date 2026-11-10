import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
test("recovery passes sleeping owners and preserves healthy runs and newly due quota waits", async () => {
  const url = new URL(process.env.DATABASE_URL!),
    name = "netlify_" + randomUUID().replaceAll("-", "") + "_e2e";
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  url.pathname = "/" + name;
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  let dispatches = 0;
  const server = createServer((request, response) => {
    assert.equal(
      request.headers.authorization,
      "Bearer quota-recovery-fixture",
    );
    dispatches++;
    request.resume();
    response.writeHead(200, { "x-awl-ack": "ack" });
    response.end("ack");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await db.query(
      `CREATE TABLE users(id uuid PRIMARY KEY,is_demo boolean DEFAULT false);CREATE TABLE jobs(id uuid PRIMARY KEY,user_id uuid REFERENCES users,state text,workflow_run_id text,dispatch_token text,dispatch_after timestamptz DEFAULT now(),locked_at timestamptz,available_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),error text,finished_at timestamptz)`,
    );
    for (let i = 0; i < 20; i++) {
      const user = randomUUID();
      await db.query("INSERT INTO users(id) VALUES($1)", [user]);
      await db.query(
        "INSERT INTO jobs(id,user_id,state,workflow_run_id,locked_at,available_at,created_at) VALUES($1,$2,'processing',$3,now()-interval '1 day',now()+interval '1 day',now()-interval '1 day')",
        [randomUUID(), user, "netlify:" + randomUUID()],
      );
    }
    const insert = async (state: string, locked: string, available: string) => {
      const user = randomUUID(),
        job = randomUUID();
      await db.query("INSERT INTO users(id) VALUES($1)", [user]);
      await db.query(
        `INSERT INTO jobs(id,user_id,state,workflow_run_id,locked_at,available_at,created_at) VALUES($1,$2,$3,$4,now()+($5::int*interval '1 minute'),now()+($6::int*interval '1 minute'),now()-interval '1 hour')`,
        [
          job,
          user,
          state,
          state === "queued" ? null : "netlify:" + randomUUID(),
          locked,
          available,
        ],
      );
      return job;
    };
    const queued = await insert("queued", "-60", "0"),
      stale = await insert("processing", "-60", "-31"),
      waking = await insert("processing", "-1440", "-1"),
      healthy = await insert("processing", "0", "-60");
    const address = server.address() as { port: number };
    const source = `globalThis.Netlify={env:{get:k=>process.env[k],toObject:()=>process.env},context:'production'};const {recoverJobs}=await import('./lib/dispatch.ts');const {pool}=await import('./lib/db.ts');try{if(await recoverJobs()!==2)throw Error('Wrong recovery batch');}finally{await pool.end();}`;
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "--eval", source],
        {
          env: {
            ...process.env,
            DATABASE_URL: url.toString(),
            APP_URL: "http://127.0.0.1:" + address.port,
            JOB_RUNNER: "netlify",
            AWL_API_KEY: "quota-recovery-fixture",
          },
          stdio: ["ignore", "ignore", "pipe"],
        },
      );
      let stderr = "";
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(stderr)),
      );
    });
    assert.equal(dispatches, 1);
    const { rows } = await db.query(
      "SELECT id,state,workflow_run_id,dispatch_token FROM jobs WHERE id=ANY($1::uuid[])",
      [[queued, stale, waking, healthy]],
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    assert.match(byId.get(queued).workflow_run_id, /^netlify:/);
    assert.ok(byId.get(queued).dispatch_token);
    assert.equal(byId.get(stale).state, "failed");
    assert.equal(byId.get(waking).state, "processing");
    assert.equal(byId.get(healthy).state, "processing");
    await db.query(
      "CREATE TABLE job_chunks(job_id uuid,chunk_index integer,completed boolean);CREATE TABLE job_reductions(job_id uuid,level integer,batch_index integer,completed boolean)",
    );
    const analysis = await insert("processing", "0", "-1"),
      token = randomUUID();
    await db.query("UPDATE jobs SET dispatch_token=$2 WHERE id=$1", [
      analysis,
      token,
    ]);
    await db.query(
      "INSERT INTO job_chunks SELECT $1::uuid,i,i<2 FROM generate_series(0,5) i",
      [analysis],
    );
    await db.query(
      "INSERT INTO job_reductions SELECT $1::uuid,0,i,i<3 FROM generate_series(0,3) i",
      [analysis],
    );
    const extracts: number[] = [],
      reductions: number[] = [];
    const actions = {
      prepare: async () => 6,
      extract: async (_job: string, index: number, count: number) => {
        extracts.push(index);
        await db.query(
          "UPDATE job_chunks SET completed=true WHERE job_id=$1 AND chunk_index>=$2 AND chunk_index<$3",
          [analysis, index, index + count],
        );
        return 0;
      },
      planReduction: async (_job: string, level: number) =>
        level === 0 ? 4 : 0,
      reduce: async (_job: string, _level: number, index: number) => {
        reductions.push(index);
        return 0;
      },
      publish: async () => {
        await db.query("UPDATE jobs SET state='succeeded' WHERE id=$1", [
          analysis,
        ]);
        return 0;
      },
      failed: async () => {
        throw Error("Unexpected failure");
      },
    };
    const { analysisWorkload } =
      await import("../netlify/functions/discovery-background.mjs");
    await analysisWorkload(
      { eventData: { jobId: analysis, attempt: token }, attempt: 0 } as any,
      actions as any,
      (async (sql: string, args: unknown[]) =>
        (await db.query(sql, args)).rows) as any,
    );
    assert.deepEqual(extracts, [2, 4]);
    assert.deepEqual(reductions, [3]);
    assert.equal(
      (await db.query("SELECT state FROM jobs WHERE id=$1", [analysis])).rows[0]
        .state,
      "succeeded",
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.end();
    await admin.query(`DROP DATABASE "${name}" WITH(FORCE)`);
    await admin.end();
  }
});
