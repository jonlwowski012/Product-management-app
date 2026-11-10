import { timingSafeEqual } from "node:crypto";
import { AppError } from "./db";
export function authorizeOperations(request: Request) {
  const expected = "Bearer " + (process.env.CRON_SECRET || ""),
    actual = request.headers.get("authorization") || "";
  if (
    !process.env.CRON_SECRET ||
    Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
    throw new AppError("Unauthorized", 401);
}
