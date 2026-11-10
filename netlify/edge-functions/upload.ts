import { getStore } from "@netlify/blobs";
import { verifyUploadTicket } from "../../lib/upload-ticket.ts";
declare const Netlify: { env: { get(key: string): string | undefined } };
export default async (request: Request) => {
  if (request.method !== "PUT") return new Response(null, { status: 405 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return new Response(null, { status: 403 });
  let ticket;
  try {
    ticket = verifyUploadTicket(
      (request.headers.get("authorization") || "").replace(/^Bearer /, ""),
      Netlify.env.get("APP_SECRET") || "",
    );
  } catch {
    return Response.json(
      { error: "Upload authorization expired; select the file again" },
      { status: 401 },
    );
  }
  if (Number(request.headers.get("content-length")) > ticket.size)
    return new Response(null, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > ticket.size) {
      await reader.cancel();
      return new Response(null, { status: 413 });
    }
    chunks.push(value);
  }
  if (size !== ticket.size)
    return Response.json(
      { error: "Upload size does not match its reservation" },
      { status: 400 },
    );
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const stored = await getStore({
      name: "evidence-originals",
      consistency: "strong",
    }).set(ticket.pathname, data.buffer, {
      onlyIfNew: true,
      metadata: { size },
    });
    return stored.modified
      ? Response.json(
          { uploaded: true },
          { headers: { "cache-control": "no-store" } },
        )
      : Response.json({ error: "This upload already exists" }, { status: 409 });
  } catch {
    return Response.json(
      { error: "Storage temporarily unavailable; try again" },
      { status: 503 },
    );
  }
};
