import { createHmac, randomInt } from "node:crypto";
import type pg from "pg";
import { BETA_SEATS } from "./beta-config";
import { AppError, query } from "./db";

type Client = Pick<pg.PoolClient, "query">;

export async function approveBetaEmail(client: Client, email: string) {
  await client.query("LOCK TABLE beta_invitations IN EXCLUSIVE MODE");
  const existing = await client.query(
    `SELECT 1 FROM beta_invitations i LEFT JOIN users u ON u.id=i.user_id
     WHERE COALESCE(i.approved_email,u.email)=$1`,
    [email],
  );
  if (existing.rowCount) return "existing";
  const added = await client.query(
    `INSERT INTO beta_invitations(slot,approved_email,token_hash)
     SELECT n,$1,gen_random_uuid()::text FROM generate_series(1,$2::int) n
     WHERE NOT EXISTS(SELECT 1 FROM beta_invitations WHERE slot=n
       AND (approved_email IS NOT NULL OR user_id IS NOT NULL))
     ORDER BY n LIMIT 1
     ON CONFLICT(slot) DO UPDATE SET approved_email=excluded.approved_email,
       approval_id=excluded.approval_id, token_hash=excluded.token_hash,
       created_at=clock_timestamp(), claimed_at=NULL
     WHERE beta_invitations.approved_email IS NULL AND beta_invitations.user_id IS NULL
     RETURNING slot`,
    [email, BETA_SEATS],
  );
  return added.rowCount ? "added" : "full";
}

function codeHash(email: string, code: string) {
  return createHmac("sha256", process.env.APP_SECRET!)
    .update(JSON.stringify(["beta-email", email, code]))
    .digest("hex");
}

export async function removeBetaApproval(client: Client, approval: string) {
  const {
    rows: [row],
  } = await client.query<{ user_id: string | null }>(
    "SELECT user_id FROM beta_invitations WHERE approval_id=$1",
    [approval],
  );
  if (!row) return false;
  if (row.user_id)
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
      row.user_id,
    ]);

  const removed = await client.query(
    "DELETE FROM beta_invitations WHERE approval_id=$1 AND user_id IS NOT DISTINCT FROM $2::uuid RETURNING slot",
    [approval, row.user_id],
  );
  if (!removed.rowCount) return false;
  if (row.user_id)
    await client.query(
      `UPDATE users SET
         beta_export_until=clock_timestamp()+interval '720 hours',
         cleanup_after=greatest(cleanup_after,clock_timestamp()+interval '720 hours')
       WHERE id=$1 AND deletion_requested_at IS NULL`,
      [row.user_id],
    );
  return true;
}

export function betaEmailSettings() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.BETA_EMAIL_FROM;
  if (!key || !from)
    throw new AppError(
      "Beta email verification is temporarily unavailable.",
      503,
    );
  return { key, from };
}

export async function sendBetaCode(
  email: string,
  { key, from }: ReturnType<typeof betaEmailSettings>,
) {
  const code = randomInt(0, 100_000_000).toString().padStart(8, "0");
  const hash = codeHash(email, code);
  const [pending] = await query(
    `UPDATE beta_invitations
     SET code_hash=$2,code_sent_at=clock_timestamp(),code_expires_at=clock_timestamp()+interval '10 minutes'
     WHERE approved_email=$1 AND claimed_at IS NULL
       AND (code_sent_at IS NULL OR code_sent_at<clock_timestamp()-interval '5 minutes')
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
    // Keep the code valid if the provider accepted it before a network timeout.
    await query(
      "UPDATE beta_invitations SET code_sent_at=clock_timestamp()-interval '4 minutes' WHERE approved_email=$1 AND code_hash=$2",
      [email, hash],
    );
    console.error("Beta verification email delivery failed");
  }
}

export async function lockBetaApproval(
  client: Client,
  email: string,
  code: string | undefined,
) {
  const {
    rows: [approval],
  } = await client.query<{ approval_id: string }>(
    `SELECT approval_id FROM beta_invitations
     WHERE approved_email=$1 AND claimed_at IS NULL AND code_hash=$2 AND code_expires_at>clock_timestamp()
     FOR UPDATE`,
    [email, code ? codeHash(email, code) : null],
  );
  if (!approval)
    throw new AppError(
      "Enter a current code sent to your approved beta email.",
      403,
    );
  return approval.approval_id;
}

export async function claimBetaApproval(
  client: Client,
  approval: string,
  user: string,
) {
  await client.query(
    `UPDATE beta_invitations SET user_id=$1,claimed_at=clock_timestamp(),code_hash=NULL,code_expires_at=NULL
     WHERE approval_id=$2`,
    [user, approval],
  );
}
