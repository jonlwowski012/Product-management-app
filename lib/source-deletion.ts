import type pg from "pg";
import { AppError, assertPersonalUser, id, query, transaction } from "./db";
import { signalKey } from "./research-model";
import type { Finding } from "./opportunities";

async function affectedSources(c: pg.PoolClient, user: string, source: string) {
  const {
    rows: [original],
  } = await c.query(
    "SELECT id,sha256,storage_path,storage_key FROM discovery_sources WHERE id=$1 AND user_id=$2",
    [source, user],
  );
  if (!original) throw new AppError("Source not found", 404);
  const { rows: legacy } = await c.query(
    `SELECT id,storage_path FROM transcripts WHERE user_id=$1
       AND encode(sha256(convert_to(replace(encode(convert_to(raw_text,'UTF8'),'base64'),E'\\n',''),'UTF8')),'hex')=$2`,
    [user, original.sha256],
  );
  const { rows: reports } = await c.query(
    `WITH RECURSIVE affected(id) AS (
       SELECT report_id FROM discovery_report_sources WHERE user_id=$1 AND source_id=$2
       UNION
       SELECT r.id FROM discovery_reports r JOIN affected a
         ON a.id IN (r.parent_id,r.recovery_root_id,r.recovery_of) WHERE r.user_id=$1
     ) SELECT r.id,r.created_at,coalesce(nullif(r.question,''),r.result->'opportunities'->0->>'title','Discovery report') AS title
       FROM affected a JOIN discovery_reports r ON r.id=a.id AND r.user_id=$1 ORDER BY r.id`,
    [user, source],
  );
  const reportIds = reports.map((r) => r.id);
  const { rows: findings } = await c.query(
    `SELECT f AS finding FROM discovery_reports r
     CROSS JOIN LATERAL jsonb_array_elements(r.result->'findings') f
     WHERE r.user_id=$1 AND r.id=ANY($2::uuid[]) AND f->>'source_id'=$3
     UNION
     SELECT f FROM jobs j JOIN job_chunks c ON c.job_id=j.id
     CROSS JOIN LATERAL jsonb_array_elements(c.candidates) f
     WHERE j.user_id=$1 AND j.report_id=ANY($2::uuid[]) AND f->>'source_id'=$3`,
    [user, reportIds, source],
  );
  const { rows: signals } = await c.query(
    "SELECT id FROM signals WHERE user_id=$1 AND transcript_id=ANY($2::uuid[])",
    [user, legacy.map((t) => t.id)],
  );
  return {
    original,
    legacy,
    reportIds,
    reports,
    signalIds: signals.map((s) => s.id),
    signalKeys: [
      ...new Set(
        findings.map(({ finding }) =>
          signalKey(finding as Finding, "source", original.sha256),
        ),
      ),
    ],
  };
}

export async function sourceDeletionImpact(user: string, source: string) {
  return transaction(async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const impact = await affectedSources(c, user, source);
    return {
      reports: impact.reportIds.length,
      signals: impact.signalKeys.length + impact.signalIds.length,
      reportIds: impact.reportIds,
      examples: impact.reports
        .slice(0, 5)
        .map(({ title, created_at }) => ({ title, created_at })),
    };
  });
}

export async function deleteDiscoverySource(
  user: string,
  source: string,
  expectedReports: string[],
) {
  return transaction(async (c) => {
    await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user]);
    await assertPersonalUser(user, c);
    const {
      rows: [active],
    } = await c.query(
      "SELECT 1 FROM jobs WHERE user_id=$1 AND state IN ('queued','processing') LIMIT 1",
      [user],
    );
    if (active)
      throw new AppError(
        "Wait for your analysis to finish before deleting a transcript.",
        409,
      );
    const impact = await affectedSources(c, user, source);
    if (
      JSON.stringify(impact.reportIds) !==
      JSON.stringify([...expectedReports].sort())
    )
      throw new AppError(
        "Affected reports changed. Review the deletion again.",
        409,
      );
    const receipt = id();
    const paths = [
      ...new Set(
        [
          impact.original.storage_path ?? impact.original.storage_key,
          ...impact.legacy.map((x) => x.storage_path),
        ].filter(Boolean),
      ),
    ];
    for (const file of paths) {
      await c.query(
        `INSERT INTO storage_deletions(pathname,source_deletion_id) VALUES($1,$2)
         ON CONFLICT(pathname) DO UPDATE SET source_deletion_id=$2,not_before=now()`,
        [file, receipt],
      );
    }
    await c.query(
      "DELETE FROM upload_reservations WHERE user_id=$1 AND discovery AND (result->'sources' @> $2::jsonb OR blob_url=ANY($3::text[])) AND state='completed'",
      [user, JSON.stringify([{ id: source }]), paths],
    );
    await c.query(
      "DELETE FROM discovery_reports WHERE user_id=$1 AND id=ANY($2::uuid[])",
      [user, impact.reportIds],
    );
    await c.query(
      "DELETE FROM research_signal_edits WHERE user_id=$1 AND signal_key=ANY($2::text[])",
      [user, impact.signalKeys],
    );
    if (impact.legacy.length) {
      await c.query(
        "DELETE FROM briefs WHERE user_id=$1 AND id IN (SELECT brief_id FROM brief_signals WHERE user_id=$1 AND signal_id=ANY($2::uuid[]))",
        [user, impact.signalIds],
      );
      await c.query(
        "UPDATE assessments SET confirmed=false,evidence_ids=ARRAY(SELECT unnest(evidence_ids) EXCEPT SELECT unnest($2::uuid[])) WHERE user_id=$1 AND evidence_ids && $2::uuid[]",
        [user, impact.signalIds],
      );
      await c.query(
        "DELETE FROM transcripts WHERE user_id=$1 AND id=ANY($2::uuid[])",
        [user, impact.legacy.map((t) => t.id)],
      );
    }
    await c.query("DELETE FROM discovery_sources WHERE user_id=$1 AND id=$2", [
      user,
      source,
    ]);
    await c.query(
      "INSERT INTO audit(id,user_id,action,entity_type,entity_id) VALUES($1,$2,'source.deleted','source',$3)",
      [receipt, user, source],
    );
    return { receipt, pending: paths.length > 0 };
  });
}

export async function sourceDeletionStatus(user: string, receipt: string) {
  const [row] = await query(
    `SELECT EXISTS(SELECT 1 FROM storage_deletions WHERE source_deletion_id=$2) AS pending
     FROM audit WHERE user_id=$1 AND id=$2 AND action='source.deleted'`,
    [user, receipt],
  );
  if (!row) throw new AppError("Deletion not found", 404);
  return { pending: row.pending };
}
