import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
const ticketSchema = z.object({
  pathname: z
    .string()
    .regex(/^incoming\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/[^/\\]{1,200}$/),
  size: z.number().int().positive().max(10485760),
  expires: z.number().int().positive(),
});
export function signUploadTicket(
  pathname: string,
  size: number,
  expires: number,
  secret: string,
) {
  if (secret.length < 32) throw new Error("Upload signing is not configured");
  const payload = Buffer.from(
    JSON.stringify(ticketSchema.parse({ pathname, size, expires })),
  ).toString("base64url");
  return (
    payload +
    "." +
    createHmac("sha256", secret).update(payload).digest("base64url")
  );
}
export function verifyUploadTicket(
  token: string,
  secret: string,
  now = Date.now(),
) {
  if (secret.length < 32 || token.length > 1200)
    throw new Error("Invalid upload ticket");
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined)
    throw new Error("Invalid upload ticket");
  const expected = createHmac("sha256", secret).update(payload).digest(),
    actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error("Invalid upload ticket");
  const ticket = ticketSchema.parse(
    JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
  );
  if (ticket.expires <= now || ticket.expires > now + 15 * 60 * 1000)
    throw new Error("Upload ticket expired");
  return ticket;
}
