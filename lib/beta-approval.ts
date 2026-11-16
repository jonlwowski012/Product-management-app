import type pg from "pg";
import { BETA_SEATS } from "./beta-config";

type Client = Pick<pg.PoolClient, "query">;

export async function approveBetaEmail(client: Client, email: string) {
  const {
    rows: [user],
  } = await client.query<{ id: string }>(
    "SELECT id FROM users WHERE email=$1 AND NOT is_demo AND deletion_requested_at IS NULL FOR UPDATE",
    [email],
  );
  if (!user) return "missing";

  await client.query("LOCK TABLE beta_invitations IN EXCLUSIVE MODE");
  const existing = await client.query(
    "SELECT 1 FROM beta_invitations WHERE user_id=$1",
    [user.id],
  );
  if (existing.rowCount) return "existing";

  // Old invite slots can be reused without leaving a redeemable link behind.
  const added = await client.query(
    `INSERT INTO beta_invitations(slot,user_id,token_hash,claimed_at)
     SELECT n,$1,gen_random_uuid()::text,clock_timestamp() FROM generate_series(1,$2::int) n
     WHERE NOT EXISTS(SELECT 1 FROM beta_invitations WHERE slot=n AND user_id IS NOT NULL)
     ORDER BY n LIMIT 1
     ON CONFLICT(slot) DO UPDATE SET user_id=excluded.user_id,
       approval_id=excluded.approval_id,token_hash=excluded.token_hash,
       created_at=clock_timestamp(),claimed_at=excluded.claimed_at
     WHERE beta_invitations.user_id IS NULL
     RETURNING slot`,
    [user.id, BETA_SEATS],
  );
  return added.rowCount ? "added" : "full";
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
