import { createHmac, randomInt } from "node:crypto";
import type pg from "pg";
import { BETA_SEATS } from "./beta-config";
import { AppError, query } from "./db";

type Client = Pick<pg.PoolClient, "query">;

export async function approveBetaEmail(client: Client, email: string) {
  await client.query("LOCK TABLE beta_invitations IN EXCLUSIVE MODE");
  const existing = await client.query(
    "SELECT 1 FROM beta_invitations WHERE approved_email=$1",
    [email],
  );
  if (existing.rowCount) return "existing";
  const added = await client.query(
    `INSERT INTO beta_invitations(slot,approved_email)
     SELECT n,$1 FROM generate_series(1,$2::int) n
     WHERE NOT EXISTS(SELECT 1 FROM beta_invitations WHERE slot=n)
     ORDER BY n LIMIT 1 RETURNING slot`,
    [email, BETA_SEATS],
  );
  return added.rowCount ? "added" : "full";
}

function codeHash(email: string, code: string) {
  return createHmac("sha256", process.env.APP_SECRET!)
    .update(JSON.stringify(["beta-email", email, code]))
    .digest("hex");
}

export async function sendBetaCode(email: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.BETA_EMAIL_FROM;
  if (!key || !from)
    throw new AppError(
      "Beta email verification is temporarily unavailable.",
      503,
    );

  const code = randomInt(0, 100_000_000).toString().padStart(8, "0");
  const hash = codeHash(email, code);
  const [pending] = await query(
    `UPDATE beta_invitations
     SET code_hash=$2,code_sent_at=clock_timestamp(),code_expires_at=clock_timestamp()+interval '10 minutes'
     WHERE approved_email=$1 AND claimed_at IS NULL
       AND (code_sent_at IS NULL OR code_sent_at<clock_timestamp()-interval '1 minute')
     RETURNING approval_id`,
    [email, hash],
  );
  if (!pending) return;

  try {
    const endpoint =
      process.env.NODE_ENV === "development" &&
      process.env.E2E_TEST_MODE === "1"
        ? "http://127.0.0.1:3105/emails"
        : "https://api.resend.com/emails";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Your Evidence beta verification code",
        text: `Your Evidence beta verification code is ${code}. It expires in 10 minutes.`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Email delivery request failed");
  } catch {
    await query(
      "UPDATE beta_invitations SET code_hash=NULL,code_expires_at=NULL,code_sent_at=NULL WHERE approved_email=$1 AND code_hash=$2",
      [email, hash],
    );
    throw new AppError(
      "Could not send the verification code. Try again shortly.",
      503,
    );
  }
}

export async function claimBetaEmail(
  client: Client,
  email: string,
  user: string,
  code: string | undefined,
) {
  const result = await client.query(
    `UPDATE beta_invitations SET user_id=$1,claimed_at=clock_timestamp(),code_hash=NULL,code_expires_at=NULL
     WHERE approved_email=$2 AND claimed_at IS NULL AND code_hash=$3 AND code_expires_at>clock_timestamp()
     RETURNING slot`,
    [user, email, code ? codeHash(email, code) : null],
  );
  if (!result.rowCount)
    throw new AppError(
      "Enter a current code sent to your approved beta email.",
      403,
    );
}
