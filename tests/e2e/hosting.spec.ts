import { test, expect } from "@playwright/test";
import { signup, api, seed, connect, completed } from "./helpers";
import { transcript } from "../fixtures/transcripts";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import "dotenv/config";
function database() {
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!,
  );
  if (!process.env.TEST_DATABASE_URL) url.pathname += "_e2e";
  return new pg.Client({ connectionString: url.toString() });
}

test("upload tokens are owner scoped, path restricted, expiring and callback authenticated", async ({
  page,
  browser,
}) => {
  await signup(page);
  const s = await seed(page);
  const {
    reservations: [r],
  } = await api(page, "uploads/reserve", {
    customer_id: s.customer,
    title: "Upload",
    files: [{ name: "safe.txt", size: 100 }],
  });
  const foreign = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
  });
  const other = await foreign.newPage();
  await signup(other);
  for (const endpoint of ["uploads/complete", "uploads/token"]) {
    const result = await other.request.post("/api/" + endpoint, {
      data: endpoint.endsWith("complete")
        ? { id: r.id }
        : {
            type: "blob.generate-client-token",
            payload: {
              pathname: r.pathname,
              clientPayload: r.id,
              multipart: false,
            },
          },
    });
    expect(result.ok()).toBe(false);
  }
  const wrong = await page.request.post("/api/uploads/token", {
    data: {
      type: "blob.generate-client-token",
      payload: {
        pathname: r.pathname + "-other",
        clientPayload: r.id,
        multipart: false,
      },
    },
  });
  expect(wrong.status()).toBe(403);
  const token = await api(page, "uploads/token", {
    type: "blob.generate-client-token",
    payload: { pathname: r.pathname, clientPayload: r.id, multipart: false },
  });
  expect(token.clientToken).toMatch(/^vercel_blob_client_/);
  const forged = await page.request.post("/api/uploads/token", {
    data: {
      type: "blob.upload-completed",
      payload: { blob: { pathname: r.pathname }, tokenPayload: r.id },
    },
  });
  expect(forged.ok()).toBe(false);
  const csrf = await page.request.post("/api/uploads/reserve", {
    headers: { Origin: "https://attacker.invalid" },
    data: {},
  });
  expect(csrf.status()).toBe(403);
  const db = database();
  await db.connect();
  try {
    await db.query(
      "UPDATE upload_reservations SET expires_at=now()-interval '1 second' WHERE id=$1",
      [r.id],
    );
    const expired = await page.request.post("/api/uploads/complete", {
      data: { id: r.id },
    });
    expect(expired.status()).toBe(410);
  } finally {
    await db.end();
    await foreign.close();
  }
});

test("workspace pages and search include every record without leaking another user's data", async ({
  page,
}) => {
  await signup(page);
  const data = await api(page, "bootstrap");
  const db = database();
  await db.connect();
  try {
    for (let index = 0; index < 115; index++)
      await db.query(
        "INSERT INTO customers(id,user_id,name) VALUES($1,$2,$3)",
        [
          randomUUID(),
          data.user.id,
          "Paged customer " + String(index).padStart(3, "0"),
        ],
      );
    const ids = new Set<string>();
    let offset: number | null = 0;
    while (offset !== null) {
      const result = await api(page, "workspace/customers?offset=" + offset);
      expect(result.items.length).toBeLessThanOrEqual(50);
      for (const row of result.items) ids.add(row.id);
      offset = result.next;
    }
    expect(ids.size).toBe(115);
    const found = await api(
      page,
      "workspace/customers?q=" + encodeURIComponent("customer 114"),
    );
    expect(found.items).toHaveLength(1);
  } finally {
    await db.end();
  }
});

test("Workflow extraction resumes a saved chunk and keeps source data out of durable arguments", async ({
  page,
}) => {
  await signup(page);
  await connect(page, "openai", "mock-checkpoint");
  const content =
    transcript +
    "\n" +
    "[00:55] Customer: Additional interview context.\n".repeat(1000);
  const s = await seed(page, content);
  const job = await api(page, "transcripts/" + s.transcript + "/extract", {});
  const data = await completed(page, job.id);
  expect(data.jobs.find((j: any) => j.id === job.id).attempts).toBe(2);
  const db = database();
  await db.connect();
  try {
    const { rows: chunks } = await db.query(
      "SELECT * FROM job_chunks WHERE job_id=$1 ORDER BY chunk_index",
      [job.id],
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.completed)).toBe(true);
    const {
      rows: [record],
    } = await db.query("SELECT workflow_run_id FROM jobs WHERE id=$1", [
      job.id,
    ]);
    expect(record.workflow_run_id).toMatch(/^wrun_/);
    const logged = JSON.parse(
      await readFile(
        `.local/workflow-e2e/runs/${record.workflow_run_id}.json`,
        "utf8",
      ),
    );
    const args = Buffer.from(logged.input.data, "base64").toString("utf8");
    expect(args).toContain(job.id);
    expect(args).not.toContain(content.slice(0, 50));
    for (const filename of await readdir(
      `.local/workflow-e2e/steps/${record.workflow_run_id}`,
    )) {
      const step = JSON.parse(
        await readFile(
          `.local/workflow-e2e/steps/${record.workflow_run_id}/${filename}`,
          "utf8",
        ),
      );
      for (const field of ["input", "output"])
        if (step[field]?.data) {
          const serialized = Buffer.from(step[field].data, "base64").toString(
            "utf8",
          );
          expect(serialized).not.toContain("We need audit logs");
          expect(serialized).not.toContain("test-openai-");
        }
    }

    const calls = await (
      await page.request.get("http://127.0.0.1:3101/__requests")
    ).json();
    expect(
      calls.filter((c: any) => c.model === "mock-checkpoint"),
    ).toHaveLength(chunks.length + 1);
    // Completion replay is idempotent even if a platform delivers a step twice.
    expect(data.signals.length).toBe(7);
  } finally {
    await db.end();
  }
});

test("maintenance recovers an undispatched job from the committed outbox", async ({
  page,
}) => {
  await signup(page);
  await connect(page);
  const s = await seed(page);
  const workspace = await api(page, "bootstrap");
  const db = database();
  await db.connect();
  const jid = randomUUID();
  try {
    const {
      rows: [source],
    } = await db.query("SELECT sha256 FROM transcripts WHERE id=$1", [
      s.transcript,
    ]);
    await db.query(
      "INSERT INTO jobs(id,user_id,transcript_id,purpose,provider,model,source_hash) VALUES($1,$2,$3,'extract','openai','gpt-4.1-mini',$4)",
      [jid, workspace.user.id, s.transcript, source.sha256],
    );
    const response = await page.request.get("/api/maintenance", {
      headers: { authorization: "Bearer e2e-maintenance-secret" },
    });
    expect(response.ok()).toBe(true);
    const result = await completed(page, jid);
    expect(result.signals).toHaveLength(7);
    const {
      rows: [saved],
    } = await db.query("SELECT workflow_run_id FROM jobs WHERE id=$1", [jid]);
    expect(saved.workflow_run_id).toMatch(/^wrun_/);
  } finally {
    await db.end();
  }
});

test("opening the workspace recovers an undispatched job on the Hobby plan", async ({
  page,
}) => {
  await signup(page);
  await connect(page);
  const s = await seed(page);
  const workspace = await api(page, "bootstrap");
  const db = database();
  await db.connect();
  const jid = randomUUID();
  try {
    const {
      rows: [source],
    } = await db.query("SELECT sha256 FROM transcripts WHERE id=$1", [
      s.transcript,
    ]);
    await db.query(
      "INSERT INTO jobs(id,user_id,transcript_id,purpose,provider,model,source_hash) VALUES($1,$2,$3,'extract','openai','gpt-4.1-mini',$4)",
      [jid, workspace.user.id, s.transcript, source.sha256],
    );
    const response = await page.request.get("/api/bootstrap?paged=1");
    expect(response.ok()).toBe(true);
    const result = await completed(page, jid);
    expect(result.signals).toHaveLength(7);
    const {
      rows: [saved],
    } = await db.query("SELECT workflow_run_id FROM jobs WHERE id=$1", [jid]);
    expect(saved.workflow_run_id).toMatch(/^wrun_/);
  } finally {
    await db.end();
  }
});
