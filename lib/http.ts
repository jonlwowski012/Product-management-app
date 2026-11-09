import { AppError } from "./db";
import { ZodError } from "zod";
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (
    origin &&
    origin !== new URL(req.url).origin &&
    origin !== process.env.APP_URL
  )
    throw new AppError("Cross-origin request rejected", 403);
}
export async function smallJson(req: Request) {
  const reader = req.body?.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  if (!reader) throw new AppError("JSON body required");
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 32768) {
      await reader.cancel();
      throw new AppError("Request is too large", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("Invalid JSON body");
  }
}
export async function apiResult(fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    return result instanceof Response
      ? result
      : Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status =
      error instanceof AppError
        ? error.status
        : error instanceof ZodError
          ? 400
          : 500;
    return Response.json(
      {
        error:
          error instanceof AppError
            ? error.message
            : error instanceof ZodError
              ? "Invalid request"
              : "Service unavailable. Try again.",
      },
      { status },
    );
  }
}
