import type pg from "pg";
import { AppError, query } from "./db";

export type SourceWrite =
  | { claim: { id: string; token: string } }
  | { startedAt: string }
  | { legacyTranscriptId: string };

export async function beginDirectSourceWrite() {
  const [row] = await query<{ started_at: string }>(
    "SELECT clock_timestamp()::text AS started_at",
  );
  return { startedAt: row.started_at };
}

export async function lockSourceWrite(
  client: Pick<pg.PoolClient, "query">,
  user: string,
  origin: SourceWrite,
) {
  await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user]);
  if ("claim" in origin) {
    const result = await client.query(
      "SELECT id FROM upload_reservations WHERE id=$1 AND user_id=$2 AND processing_token=$3 AND expires_at>clock_timestamp() AND locked_at>clock_timestamp()-interval '5 minutes' AND state='processing' FOR UPDATE",
      [origin.claim.id, user, origin.claim.token],
    );
    if (!result.rowCount) throw new AppError("Upload no longer available", 410);
  } else if ("legacyTranscriptId" in origin) {
    const result = await client.query(
      "SELECT id FROM transcripts WHERE id=$1 AND user_id=$2",
      [origin.legacyTranscriptId, user],
    );
    if (!result.rowCount)
      throw new AppError(
        "A conversation is no longer available. Return to Signals and try again.",
        404,
      );
  } else {
    const result = await client.query(
      "SELECT 1 FROM audit WHERE user_id=$1 AND action='source.deleted' AND created_at>=$2::timestamptz LIMIT 1",
      [user, origin.startedAt],
    );
    if (result.rowCount)
      throw new AppError(
        "A transcript was deleted during this upload. Select the files you want to keep and try again.",
        409,
      );
  }
}
