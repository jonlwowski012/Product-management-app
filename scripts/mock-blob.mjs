// Test-only HTTP double for the Blob service. Application code uses the real SDK.
import { createServer } from "node:http";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
const master = "vercel_blob_rw_e2estore_test-secret";
export async function mockBlob(port = 3102) {
  const objects = new Map();
  const base = `http://127.0.0.1:${port}`;
  const server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3100");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,OPTIONS");
    if (req.method === "OPTIONS") {
      res.end();
      return;
    }
    const url = new URL(req.url, base),
      token = req.headers.authorization?.replace("Bearer ", "");
    const fail = (status, code) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code, message: code } }));
    };
    const json = (data) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    };
    const metadata = (pathname, obj) => ({
      pathname,
      url: base + "/objects/" + encodeURIComponent(pathname),
      downloadUrl: base + "/objects/" + encodeURIComponent(pathname),
      size: obj.bytes.length,
      contentType: obj.contentType,
      contentDisposition: 'attachment; filename="transcript.txt"',
      cacheControl: "private, no-store",
      uploadedAt: obj.created,
      etag: obj.etag,
    });
    if (req.method === "GET" && url.pathname.startsWith("/objects/")) {
      if (token !== master) return fail(403, "not_allowed");
      const obj = objects.get(decodeURIComponent(url.pathname.slice(9)));
      if (!obj) return fail(404, "not_found");
      res.writeHead(200, {
        "Content-Type": obj.contentType,
        "Content-Length": obj.bytes.length,
        ETag: obj.etag,
        "Last-Modified": new Date(obj.created).toUTCString(),
      });
      res.end(obj.bytes);
      return;
    }
    let policy;
    if (token !== master) {
      try {
        const signed = Buffer.from(token.split("_")[4], "base64").toString(),
          [signature, payload] = signed.split(".");
        const expected = createHmac("sha256", master)
          .update(payload)
          .digest("hex");
        if (
          signature.length !== expected.length ||
          !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
        )
          throw Error();
        policy = JSON.parse(Buffer.from(payload, "base64").toString());
        if (policy.validUntil < Date.now() || req.method !== "PUT")
          throw Error();
      } catch {
        return fail(403, "not_allowed");
      }
    }
    if (req.method === "GET") {
      const key = url.searchParams.get("url"),
        obj = objects.get(key);
      if (!obj) return fail(404, "not_found");
      return json(metadata(key, obj));
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    if (req.method === "POST" && url.pathname === "/delete") {
      for (const target of JSON.parse(bytes.toString()).urls) {
        let pathname = target;
        if (target.startsWith("http"))
          pathname = decodeURIComponent(new URL(target).pathname.slice(9));
        objects.delete(pathname);
      }
      return json({});
    }
    if (req.method === "PUT") {
      const pathname = url.searchParams.get("pathname");
      if (
        policy &&
        (policy.pathname !== pathname ||
          bytes.length > policy.maximumSizeInBytes)
      )
        return fail(403, "pathname_mismatch");
      if (policy && objects.has(pathname) && !policy.allowOverwrite)
        return fail(400, "bad_request");
      if (req.headers["x-vercel-blob-access"] !== "private")
        return fail(403, "not_allowed");
      const contentType =
        req.headers["x-content-type"] ??
        req.headers["content-type"] ??
        "application/octet-stream";
      if (policy && !policy.allowedContentTypes.includes(contentType))
        return fail(400, "content_type_not_allowed");
      const obj = {
        bytes,
        contentType,
        created: new Date().toISOString(),
        etag: createHash("sha256").update(bytes).digest("hex"),
      };
      objects.set(pathname, obj);
      json(metadata(pathname, obj));
      if (policy?.onUploadCompleted?.callbackUrl) {
        const body = JSON.stringify({
          type: "blob.upload-completed",
          payload: {
            blob: metadata(pathname, obj),
            tokenPayload: policy.onUploadCompleted.tokenPayload,
          },
        });
        void fetch(policy.onUploadCompleted.callbackUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-vercel-signature": createHmac("sha256", master)
              .update(body)
              .digest("hex"),
          },
          body,
        }).catch(() => {});
      }
      return;
    }
    fail(404, "not_found");
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return server;
}
