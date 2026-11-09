import { createCipheriv, createHash, randomBytes } from "node:crypto";
import type pg from "pg";

export async function paidAccount(
  db: pg.Client | pg.Pool,
  user: string,
  model = "gpt-4.1-mini",
  provider = "openai",
  secret = process.env.APP_SECRET!,
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    createHash("sha256").update(secret).digest(),
    iv,
  );
  const value = Buffer.concat([
    cipher.update("test-provider-key-" + user, "utf8"),
    cipher.final(),
  ]);
  const key = [
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    value.toString("hex"),
  ].join(".");
  await db.query(
    "INSERT INTO subscriptions(user_id,status,paid_until) VALUES($1,'active',now()+interval '30 days') ON CONFLICT(user_id) DO UPDATE SET status='active',paid_until=excluded.paid_until",
    [user],
  );
  await db.query(
    `INSERT INTO settings(user_id,provider,model,${provider}_key) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET provider=$2,model=$3,${provider}_key=$4`,
    [user, provider, model, key],
  );
}
