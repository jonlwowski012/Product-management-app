import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { AppError } from "./db";
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const test = scryptSync(password, salt, 64);
  return timingSafeEqual(test, Buffer.from(hash, "hex"));
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function encrypt(value: string) {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 32)
    throw new AppError("Set APP_SECRET to at least 32 random characters", 503);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(hash(secret), "hex"), iv);
  const encrypted = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return [
    iv.toString("hex"),
    c.getAuthTag().toString("hex"),
    encrypted.toString("hex"),
  ].join(".");
}
export function decrypt(value: string) {
  const [iv, tag, data] = value.split(".");
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET is required");
  const c = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(hash(secret), "hex"),
    Buffer.from(iv, "hex"),
  );
  c.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([
    c.update(Buffer.from(data, "hex")),
    c.final(),
  ]).toString("utf8");
}
