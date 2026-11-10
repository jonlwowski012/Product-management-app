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
test("background checkpoints yield, quota deferrals do not grow history, and early replays cannot call the provider", async () => {
  const h = await createSdkHarness(1794240000000);
  let availableAt = 0,
    quota = true,
    extracts = 0,
    publishes = 0,
    failures = 0,
    heartbeats = 0;
  const actions = {
    prepare: async () => 2,
    extract: async () => {
      extracts++;
      return quota ? 60 : 0;
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
  const query = (async (sql: string, args: unknown[]) => {
    if (sql.includes("SET available_at")) {
      availableAt = Date.now() + Number(args[2]) * 1000;
      return [];
    }
    heartbeats++;
    return [{ id: data.jobId, wait_ms: Math.max(0, availableAt - Date.now()) }];
  }) as typeof database;
  const handler = (event: any) => analysisWorkload(event, actions, query);
  try {
    await h.invoke(handler, { data });
    let persisted = h.latestPersisted();
    assert.equal(extracts, 0);
    assert.equal(persisted.stepResults.length, 1);
    await h.invoke(handler, { persisted });
    persisted = h.latestPersisted();
    assert.equal(extracts, 1);
    assert.equal(persisted.stepResults.length, 1);
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
      assert.equal(persisted.stepResults.length, 1);
    }
    assert.equal(failures, 0);
    quota = false;
    h.advance(60000);
    await h.invoke(handler, { persisted });
    persisted = h.latestPersisted();
    assert.equal(persisted.stepResults.length, 2);
    assert.equal(publishes, 0);
    await h.invoke(handler, { persisted });
    persisted = h.latestPersisted();
    assert.equal(publishes, 0);
    await h.invoke(handler, { persisted });
    assert.equal(publishes, 1);
    assert.ok(heartbeats > 0);
  } finally {
    h.restore();
  }
});
test("a 5,000-chunk replay stays below Netlify payload limits and skips completed provider calls", async () => {
  const h = await createSdkHarness(1794240000000);
  let publishes = 0;
  const actions = {
    prepare: async () => {
      throw Error("Cached prepare ran");
    },
    extract: async () => {
      throw Error("Completed provider call ran");
    },
    planReduction: async () => {
      throw Error("Cached plan ran");
    },
    reduce: async () => 0,
    publish: async () => {
      publishes++;
      return 0;
    },
    failed: async () => {
      throw Error("Unexpected failure");
    },
  } as typeof jobActions;
  const query = (async () => [
    { id: data.jobId, wait_ms: 0 },
  ]) as typeof database;
  const persisted = {
    eventName: "evidence.analysis",
    eventId: "synthetic-large-event",
    eventData: data,
    attemptNumber: 50,
    originalEnqueuedTime: Date.now(),
    stepResults: [
      { stepId: "prepare", stepResult: "5000" },
      ...Array.from({ length: 2500 }, (_, i) => ({
        stepId: "extract-" + i * 2,
        stepResult: "0",
      })),
      { stepId: "plan-0", stepResult: "0" },
    ],
  };
  try {
    await h.invoke((event: any) => analysisWorkload(event, actions, query), {
      persisted,
    });
    assert.equal(publishes, 1);
    assert.ok(Buffer.byteLength(JSON.stringify(h.latestPersisted())) < 500000);
  } finally {
    h.restore();
  }
});
