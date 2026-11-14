import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type RequestListener } from "node:http";
import { request, type Page } from "@playwright/test";
import { api } from "./e2e/helpers";

async function fixture(
  t: { after: (fn: () => Promise<void>) => void },
  handler: RequestListener,
) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const client = await request.newContext({
    baseURL: `http://127.0.0.1:${address.port}`,
  });
  t.after(async () => {
    await client.dispose();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { request: client } as Page;
}

test("API reads recover from one connection reset", async (t) => {
  let attempts = 0;
  const page = await fixture(t, (req, res) => {
    if (++attempts === 1) return req.socket.destroy();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  });
  assert.deepEqual(await api(page, "bootstrap"), { ok: true });
  assert.equal(attempts, 2);
});

test("API writes are never replayed after a connection reset", async (t) => {
  let attempts = 0;
  const page = await fixture(t, (req) => {
    attempts++;
    req.socket.destroy();
  });
  await assert.rejects(
    () => api(page, "sources", { content: "Synthetic" }),
    /ECONNRESET|socket hang up/,
  );
  assert.equal(attempts, 1);
});

test("API reads do not retry HTTP failures", async (t) => {
  let attempts = 0;
  const page = await fixture(t, (_req, res) => {
    attempts++;
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Synthetic service failure" }));
  });
  await assert.rejects(() => api(page, "bootstrap"));
  assert.equal(attempts, 1);
});

test("API reads still fail after repeated connection resets", async (t) => {
  let attempts = 0;
  const page = await fixture(t, (req) => {
    attempts++;
    req.socket.destroy();
  });
  await assert.rejects(
    () => api(page, "bootstrap"),
    /ECONNRESET|socket hang up/,
  );
  assert.equal(attempts, 2);
});
