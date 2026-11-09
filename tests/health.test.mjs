import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
test("health monitoring authenticates and fails for missing or actionable counters", async () => {
  let health = {};
  const server = createServer((request, response) => {
    assert.equal(request.headers.authorization, "Bearer health-fixture-secret");
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ health }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const check = () =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["scripts/health-check.mjs"], {
          env: {
            ...process.env,
            APP_URL: `http://127.0.0.1:${address.port}`,
            CRON_SECRET: "health-fixture-secret",
          },
          stdio: "ignore",
        });
        child.on("exit", resolve);
        child.on("error", reject);
      });
    assert.equal(await check(), 1);
    health = {
      stuckJobs: 0,
      storageFailures: 0,
      recentFailedJobs: 0,
      pastDueAccounts: 0,
      pendingDeletions: 0,
    };
    assert.equal(await check(), 0);
    health.pendingDeletions = 1;
    assert.equal(await check(), 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
