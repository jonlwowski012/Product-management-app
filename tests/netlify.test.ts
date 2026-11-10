import { test } from "node:test";
import assert from "node:assert/strict";
import { signUploadTicket, verifyUploadTicket } from "../lib/upload-ticket";
const secret = "unit-test-private-upload-signing-secret";
const pathname =
  "incoming/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/notes.pdf";
test("private upload tickets bind the path, exact size, expiry and signing secret", () => {
  const now = Date.now(),
    token = signUploadTicket(pathname, 10485760, now + 600000, secret);
  assert.deepEqual(verifyUploadTicket(token, secret, now), {
    pathname,
    size: 10485760,
    expires: now + 600000,
  });
  assert.throws(
    () => verifyUploadTicket(token, secret, now + 600000),
    /expired/,
  );
  assert.throws(
    () => verifyUploadTicket(token, secret + "changed", now),
    /Invalid/,
  );
  const [payload, signature] = token.split(".");
  const changed = Buffer.from(
    JSON.stringify({
      ...JSON.parse(Buffer.from(payload, "base64url").toString()),
      size: 1,
    }),
  ).toString("base64url");
  assert.throws(
    () => verifyUploadTicket(changed + "." + signature, secret, now),
    /Invalid/,
  );
  assert.throws(
    () => verifyUploadTicket(token + ".extra", secret, now),
    /Invalid/,
  );
  assert.throws(
    () => verifyUploadTicket("😀".repeat(1300), secret, now),
    /Invalid/,
  );
  assert.throws(() => signUploadTicket(pathname, 10485761, now + 1000, secret));
  assert.throws(() =>
    signUploadTicket(pathname + "/../../secret", 1, now + 1000, secret),
  );
  assert.throws(() => signUploadTicket(pathname, 1, now + 1000, "short"));
});
test("operations file access requires the existing admin secret, including malformed unicode headers", async (t) => {
  const { authorizeOperations } = await import("../lib/operations-auth");
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = secret;
  t.after(() => {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  });
  assert.doesNotThrow(() =>
    authorizeOperations(
      new Request("https://example.test", {
        headers: { authorization: "Bearer " + secret },
      }),
    ),
  );
  assert.throws(
    () => authorizeOperations(new Request("https://example.test")),
    /Unauthorized/,
  );
  assert.throws(
    () =>
      authorizeOperations(
        new Request("https://example.test", {
          headers: { authorization: "Bearer " + secret.slice(0, -1) + "é" },
        }),
      ),
    /Unauthorized/,
  );
});
