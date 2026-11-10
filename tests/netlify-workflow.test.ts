import { test } from "node:test";
import assert from "node:assert/strict";
import { createSdkHarness } from "./fixtures/netlify-sdk.mjs";
import { analysisWorkload } from "../netlify/functions/discovery-background.mjs";
import type * as jobActions from "../lib/job-steps";
import type { query as database } from "../lib/db";
const data = {
  jobId: "00000000-0000-4000-8000-000000000001",
  attempt: "00000000-0000-4000-8000-000000000002",
};
test("quota deferrals keep constant history and early replays cannot call the provider", async () => {
  const h = await createSdkHarness(1794240000000);
  let availableAt = 0,
    quota = true,
    extracts = 0,
    publishes = 0,
    failures = 0;
  const actions = {
    prepare: async () => 2,
    extract: async () => {
      extracts++;
      if (quota) {
        availableAt = Date.now() + 60000;
        return 60;
      }
      return 0;
    },
    planReduction: async () => 0,
    reduce: async () => 0,
    publish: async () => {
      publishes++;
      return 0;
    },
    failed: async () => {
      failures++;
    },
  } as typeof jobActions;
  const query = (async (sql: string) =>
    sql.startsWith("SELECT")
      ? []
      : [
          { id: data.jobId, wait_ms: Math.max(0, availableAt - Date.now()) },
        ]) as typeof database;
  const handler = (event: any) => analysisWorkload(event, actions, query);
  try {
    await h.invoke(handler, { data });
    let persisted = h.latestPersisted();
    assert.equal(extracts, 1);
    assert.equal(persisted.stepResults.length, 0);
    assert.equal(persisted.delayUntilTime - Date.now(), 60000);
    h.advance(59000);
    await h.invoke(handler, { persisted });
    persisted = h.latestPersisted();
    assert.equal(extracts, 1);
    assert.equal(persisted.delayUntilTime - Date.now(), 1000);
    for (let i = 0; i < 3; i++) {
      h.advance(60000);
      await h.invoke(handler, { persisted });
      persisted = h.latestPersisted();
      assert.equal(persisted.stepResults.length, 0);
      assert.ok(Buffer.byteLength(JSON.stringify(persisted)) < 2000);
    }
    assert.equal(failures, 0);
    quota = false;
    h.advance(60000);
    await h.invoke(handler, { persisted });
    assert.equal(publishes, 1);
  } finally {
    h.restore();
  }
});
test("time slices resume a 5,000-chunk analysis from database checkpoints without repeating provider calls", async () => {
  const h = await createSdkHarness(1794240000000),
    completed = new Set<number>();
  let providerCalls = 0,
    publishes = 0;
  const actions = {
    prepare: async () => 5000,
    extract: async (_job: string, index: number, count: number) => {
      for (let i = index; i < index + count; i++) {
        assert.ok(!completed.has(i), "Committed provider work repeated");
        completed.add(i);
        providerCalls++;
      }
      if (completed.size === 2) h.advance(9 * 60 * 1000);
      return 0;
    },
    planReduction: async () => 0,
    reduce: async () => 0,
    publish: async () => {
      publishes++;
      return 0;
    },
    failed: async () => {
      throw Error("Unexpected failure");
    },
  } as typeof jobActions;
  const query = (async (sql: string) =>
    sql.startsWith("SELECT chunk_index")
      ? [...completed].map((chunk_index) => ({ chunk_index }))
      : [{ id: data.jobId, wait_ms: 0 }]) as typeof database;
  const handler = (event: any) => analysisWorkload(event, actions, query);
  try {
    await h.invoke(handler, { data });
    const persisted = h.latestPersisted();
    assert.equal(providerCalls, 2);
    assert.equal(publishes, 0);
    assert.equal(persisted.stepResults.length, 0);
    assert.ok(Buffer.byteLength(JSON.stringify(persisted)) < 2000);
    h.advance(1000);
    await h.invoke(handler, { persisted });
    assert.equal(providerCalls, 5000);
    assert.equal(publishes, 1);
  } finally {
    h.restore();
  }
});
