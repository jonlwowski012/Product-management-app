// Isolated SDK contract harness. Every fetch is intercepted; nothing leaves this process.
import assert from "node:assert/strict";

export async function createSdkHarness(now) {
  const originals = {
    fetch: globalThis.fetch,
    Netlify: globalThis.Netlify,
    blobs: globalThis.netlifyBlobsContext,
    reactive: globalThis._reactiveScheduling,
    clock: Date.now,
  };
  const authEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      key.startsWith("AWL_API_KEY"),
    ),
  );
  for (const key of Object.keys(authEnv)) delete process.env[key];
  process.env.AWL_API_KEY = "synthetic-review-sdk-contract-key";
  globalThis.Netlify = {
    context: "production",
    env: { get: (key) => process.env[key] },
  };
  globalThis.netlifyBlobsContext = Buffer.from(
    JSON.stringify({
      siteID: "synthetic",
      token: "synthetic",
      edgeURL: "https://synthetic.invalid",
      uncachedEdgeURL: "https://synthetic.invalid",
    }),
  ).toString("base64");
  globalThis._reactiveScheduling = false;
  let clock = now;
  if (now !== undefined) Date.now = () => clock;
  const writes = [],
    objects = new Map();
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input.url || String(input),
    );
    assert.equal(
      url.hostname,
      "synthetic.invalid",
      "Unexpected network destination",
    );
    const method = (init?.method || input.method || "GET").toUpperCase();
    const key = decodeURIComponent(url.pathname);
    if (method === "PUT") {
      const text =
        init?.body !== undefined
          ? await new Response(init.body).text()
          : await input.clone().text();
      const data = JSON.parse(text);
      objects.set(key, data);
      writes.push({ method, key, data });
      return new Response("{}", { status: 200 });
    }
    if (method === "DELETE") {
      objects.delete(key);
      writes.push({ method, key });
      return new Response(null, { status: 204 });
    }
    if (method === "GET") {
      const data = objects.get(key);
      return new Response(data === undefined ? null : JSON.stringify(data), {
        status: data === undefined ? 404 : 200,
      });
    }
    throw new Error("Unexpected mocked request: " + method);
  };
  const sdk = await import("@netlify/async-workloads");
  const restore = () => {
    globalThis.fetch = originals.fetch;
    globalThis.Netlify = originals.Netlify;
    globalThis.netlifyBlobsContext = originals.blobs;
    globalThis._reactiveScheduling = originals.reactive;
    Date.now = originals.clock;
    for (const key of Object.keys(process.env).filter((key) =>
      key.startsWith("AWL_API_KEY"),
    ))
      delete process.env[key];
    Object.assign(process.env, authEnv);
  };
  return {
    sdk,
    writes,
    objects,
    restore,
    advance(ms) {
      assert.notEqual(clock, undefined);
      clock += ms;
    },
    latestPersisted() {
      const write = writes.findLast(
        (entry) =>
          entry.method === "PUT" && !entry.key.includes("state-processing/"),
      );
      assert.ok(write, "No persisted continuation");
      return structuredClone(write.data);
    },
    /** @param {(event: any) => any} handler @param {{persisted?: any, data?: object, fnName?: string, maxRetries?: number}} options */
    async invoke(
      handler,
      {
        persisted,
        data = {},
        fnName = "review-background",
        maxRetries = 100000,
      } = {},
    ) {
      const body = [
        {
          eventName: persisted?.eventName || "review",
          eventId: persisted?.eventId || "synthetic-event",
          data: persisted?.eventData ?? data,
          fnContext: "production",
          stepResults: persisted?.stepResults || [],
          attemptContext: {
            attempt: persisted?.attemptNumber || 0,
            originalQTime: persisted?.originalEnqueuedTime || Date.now(),
            maxRetries,
            nextDelayTime: 2000,
          },
        },
      ];
      return sdk.asyncWorkloadFn(handler)(
        new Request("https://synthetic.invalid/.netlify/functions/" + fnName, {
          method: "POST",
          headers: {
            authorization: "Bearer synthetic-review-sdk-contract-key",
          },
          body: JSON.stringify(body),
        }),
        {},
      );
    },
  };
}
