import type pg from "pg";
import { AppError, assertPersonalUser, id, query, transaction } from "./db";
import { loadResearch, transcriptFingerprintSql } from "./research";
import { signalKey } from "./research-model";
import type { Finding } from "./opportunities";
import { uploadKey } from "./storage";

async function affectedSources(c: pg.PoolClient, user: string, source: string) {
  const { rows: legacy } = await c.query(
    `WITH owned_transcripts AS (
       SELECT id,storage_path,${transcriptFingerprintSql} AS fingerprint
       FROM transcripts WHERE user_id=$1
     )
     SELECT id,storage_path,fingerprint FROM owned_transcripts WHERE fingerprint=coalesce(
       (SELECT sha256 FROM discovery_sources WHERE id=$2 AND user_id=$1),
       (SELECT fingerprint FROM owned_transcripts WHERE id=$2)
     )`,
    [user, source],
  );
  const {
    rows: [original],
  } = await c.query(
    "SELECT id,sha256,storage_path,storage_key FROM discovery_sources WHERE user_id=$1 AND (id=$2 OR sha256=$3)",
    [user, source, legacy[0]?.fingerprint ?? null],
  );
  if (!original && !legacy.length) throw new AppError("Source not found", 404);
  const { rows: reports } = await c.query(
    `WITH RECURSIVE affected(id) AS (
       SELECT report_id FROM discovery_report_sources WHERE user_id=$1 AND source_id=$2
       UNION
       SELECT r.id FROM discovery_reports r JOIN affected a
         ON a.id IN (r.parent_id,r.recovery_root_id,r.recovery_of) WHERE r.user_id=$1
     ) SELECT r.id,r.created_at,coalesce(nullif(r.question,''),r.result->'opportunities'->0->>'title','Discovery report') AS title
       FROM affected a JOIN discovery_reports r ON r.id=a.id AND r.user_id=$1 ORDER BY r.id`,
    [user, original?.id ?? null],
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
    [user, reportIds, original?.id ?? null],
  );
  const { rows: signals } = await c.query(
    "SELECT id,transcript_id,quote,source_start FROM signals WHERE user_id=$1 AND transcript_id=ANY($2::uuid[])",
    [user, legacy.map((t) => t.id)],
  );
  const signalIds = signals.map((s) => s.id);
  const { rows: briefs } = await c.query(
    `SELECT b.id FROM briefs b WHERE b.user_id=$1 AND (
      EXISTS(SELECT 1 FROM brief_signals bs WHERE bs.user_id=$1 AND bs.brief_id=b.id AND bs.signal_id=ANY($2::uuid[]))
      OR EXISTS(SELECT 1 FROM brief_features bf JOIN feature_signals fs ON fs.feature_id=bf.feature_id AND fs.user_id=bf.user_id
        WHERE bf.user_id=$1 AND bf.brief_id=b.id AND fs.signal_id=ANY($2::uuid[]))
      OR (b.ai_proposal->'evidence_ids') ?| $3::text[]
      OR b.draft_evidence_ids && $2::uuid[]
    ) ORDER BY b.id`,
    [user, signalIds, signalIds],
  );
  const legacyKeys = signals.map((s) =>
    signalKey(
      {
        source_id: s.transcript_id,
        page_index: 0,
        source_start: s.source_start ?? 0,
        quote: s.quote,
      },
      "transcript",
      legacy[0]?.fingerprint,
    ),
  );
  return {
    original,
    legacy,
    reportIds,
    reports,
    signalIds,
    briefIds: briefs.map((b) => b.id),
    signalKeys: [
      ...new Set([
        ...legacyKeys,
        ...findings.map(({ finding }) =>
          signalKey(finding as Finding, "source", original?.sha256),
        ),
      ]),
    ],
  };
}

async function removedSignalCount(
  c: pg.PoolClient,
  user: string,
  impact: Awaited<ReturnType<typeof affectedSources>>,
) {
  const before = await loadResearch(user, c);
  const after = await loadResearch(user, c, {
    sourceId: impact.original?.id,
    transcriptIds: impact.legacy.map((transcript) => transcript.id),
    reportIds: impact.reportIds,
  });
  const remaining = new Set(after.signals.map((signal) => signal.key));
  return before.signals.filter((signal) => !remaining.has(signal.key)).length;
}

export async function sourceDeletionImpact(user: string, source: string) {
  return transaction(async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const impact = await affectedSources(c, user, source);
    return {
      reports: impact.reportIds.length,
      signals: await removedSignalCount(c, user, impact),
      briefIds: impact.briefIds,
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
  expected: {
    reportIds: string[];
    briefIds?: string[];
    signals?: number;
  } | null,
) {
  return transaction(async (c) => {
    await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user]);
    await assertPersonalUser(user, c);
    const {
      rows: [active],
    } = await c.query(
      "SELECT 1 FROM jobs WHERE user_id=$1 AND state IN ('queued','processing') UNION ALL SELECT 1 FROM upload_reservations WHERE user_id=$1 AND state='processing' AND locked_at>=clock_timestamp()-interval '5 minutes' LIMIT 1",
      [user],
    );
    if (active)
      throw new AppError(
        "Wait for your upload or analysis to finish before deleting a transcript.",
        409,
      );
    const impact = await affectedSources(c, user, source);
    if (
      expected &&
      (JSON.stringify(impact.reportIds) !==
        JSON.stringify([...expected.reportIds].sort()) ||
        JSON.stringify(impact.briefIds) !==
          JSON.stringify([...(expected.briefIds ?? [])].sort()) ||
        (expected.signals !== undefined &&
          (await removedSignalCount(c, user, impact)) !== expected.signals))
    )
      throw new AppError(
        "Affected reports or evidence changed. Review the deletion again.",
        409,
      );
    const receipt = id();
    const { rows: uploads } = await c.query(
      `UPDATE upload_reservations SET
        processing_token=NULL,
        state=CASE WHEN state='completed' THEN state ELSE 'failed' END,
        token_expires_at=coalesce(token_expires_at,expires_at),
        expires_at=CASE WHEN state='completed' THEN expires_at ELSE clock_timestamp() END,
        source_hashes=array_remove(coalesce(source_hashes,'{}'),$3),
        result=jsonb_set(
        result,ARRAY[CASE WHEN discovery THEN 'sources' ELSE 'transcripts' END],
        (SELECT coalesce(jsonb_agg(entry),'[]'::jsonb) FROM jsonb_array_elements(
          result->(CASE WHEN discovery THEN 'sources' ELSE 'transcripts' END)
        ) entry WHERE NOT entry->>'id'=ANY($2::text[]))
      ) WHERE user_id=$1 AND (source_hashes @> ARRAY[$3]::text[]
        OR (source_hashes IS NULL AND state IN ('pending','processing','failed'))
        OR EXISTS(
        SELECT 1 FROM jsonb_array_elements(result->(CASE WHEN discovery THEN 'sources' ELSE 'transcripts' END)) entry
        WHERE entry->>'id'=ANY($2::text[])
      )) RETURNING pathname,token_expires_at + interval '5 minutes' AS cleanup_after`,
      [
        user,
        [impact.original?.id, ...impact.legacy.map((t) => t.id)].filter(
          Boolean,
        ),
        impact.original?.sha256 ?? impact.legacy[0]?.fingerprint,
      ],
    );
    const paths = new Map<string, Date | null>();
    if (impact.original?.storage_key || impact.original?.storage_path)
      paths.set(
        impact.original.storage_key ?? impact.original.storage_path,
        null,
      );
    for (const transcript of impact.legacy)
      if (transcript.storage_path) paths.set(transcript.storage_path, null);
    for (const upload of uploads)
      paths.set(uploadKey(upload.pathname), upload.cleanup_after);
    // Older jobs could expire the reservation while its incoming copy was still queued.
    const { rows: orphanedUploads } = await c.query(
      `SELECT s.pathname,s.not_before FROM storage_deletions s
       WHERE (s.pathname LIKE 'blob:incoming/' || $1::text || '/%'
         OR s.pathname LIKE 'netlify:incoming/' || $1::text || '/%')
       AND NOT EXISTS(SELECT 1 FROM upload_reservations r WHERE r.user_id=$1::uuid
         AND s.pathname IN (r.pathname,'blob:' || r.pathname))`,
      [user],
    );
    for (const upload of orphanedUploads)
      paths.set(upload.pathname, upload.not_before);
    for (const [file, cleanupAfter] of paths) {
      await c.query(
        `INSERT INTO storage_deletions(pathname,source_deletion_ids,not_before) VALUES($1,ARRAY[$2]::uuid[],greatest(now(),$3::timestamptz))
         ON CONFLICT(pathname) DO UPDATE SET source_deletion_ids=array_append(storage_deletions.source_deletion_ids,$2),not_before=excluded.not_before`,
        [file, receipt, cleanupAfter],
      );
    }
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
        "DELETE FROM briefs WHERE user_id=$1 AND id=ANY($2::uuid[])",
        [user, impact.briefIds],
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
      impact.original?.id ?? null,
    ]);
    await c.query(
      "INSERT INTO audit(id,user_id,action,entity_type,entity_id,created_at) VALUES($1,$2,'source.deleted','source',$3,clock_timestamp())",
      [receipt, user, source],
    );
    await c.query(
      `INSERT INTO audit(id,user_id,action,entity_type,entity_id)
       SELECT gen_random_uuid(),$1,'source.deleted','source',other_id
       FROM unnest($3::uuid[]) AS matches(other_id) WHERE other_id<>$2`,
      [
        user,
        source,
        [impact.original?.id, ...impact.legacy.map((t) => t.id)].filter(
          Boolean,
        ),
      ],
    );
    return { receipt, pending: paths.size > 0 };
  });
}

export async function sourceDeletionStatus(user: string, receipt: string) {
  const [row] = await query(
    `SELECT EXISTS(SELECT 1 FROM storage_deletions WHERE source_deletion_ids @> ARRAY[$2]::uuid[]) AS pending
     FROM audit WHERE user_id=$1 AND id=$2 AND action='source.deleted'`,
    [user, receipt],
  );
  if (!row) throw new AppError("Deletion not found", 404);
  return { pending: row.pending };
}
