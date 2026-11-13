import { hostedJobs } from "./job-runner";
import { ensureResearchCompanies } from "./research";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { query, transaction, id, AppError, assertWritableUser } from "./db";
import { credentials, generate, ProviderError } from "./ai";
import { readDocument, discoveryFiles } from "./documents";
import {
  findingsSchema,
  groundedFindingRequest,
  groundedReportSchema,
  findingPrompt,
  reportPrompt,
  opportunityReportSchema,
  preciseReportSchema,
  relationshipPrompt,
  verifyFindings,
  validateReport,
  type DiscoverySource,
  type Finding,
} from "./opportunities";
import type pg from "pg";
import {
  scheduleDeletion,
  blobEnabled,
  privateKey,
  putPrivate,
} from "./storage";
import {
  MAX_DISCOVERY_FILES,
  MAX_REPORT_CHARACTERS,
  MAX_ANALYSIS_CHUNKS,
} from "./discovery-limits";
import { providerIds } from "./providers";
import { billingStatus } from "./billing";
import { uniqueSourceSelections } from "./source-deduplication";
import {
  evidenceGroups,
  MAX_REDUCTION_LEVELS,
  evidenceSelectionSchema,
  evidenceSelectionPrompt,
  selectedEvidence,
} from "./evidence-reduction";
import { opportunityId } from "./discovery-experience";

export const REPORT_VERSION = "opportunities-7";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function discoverySource(
  user: string,
  name: string,
  buffer: Buffer,
  storage: string | null = null,
  storageKey: string | null = null,
) {
  await assertWritableUser(user);
  const sha = hash(buffer.toString("base64"));
  const [existing] = await query(
    "SELECT id FROM discovery_sources WHERE user_id=$1 AND sha256=$2",
    [user, sha],
  );
  if (existing) return { id: existing.id, duplicate: true };
  const parsed = await readDocument(name, buffer),
    sid = id();
  if (!storage && blobEnabled()) {
    const pathname = `source-originals/${user}/${sid}`;
    storageKey = privateKey(pathname);
    await query(
      "INSERT INTO storage_deletions(pathname,not_before) VALUES($1,now()+interval '1 day') ON CONFLICT DO NOTHING",
      [storageKey],
    );
    storage = await putPrivate(pathname, buffer, "application/octet-stream");
  } else if (!storage && !process.env.SITE_ID) {
    const folder = path.resolve(
      process.env.DATA_DIR ?? ".data",
      "sources",
      user,
    );
    await mkdir(folder, { recursive: true, mode: 0o700 });
    storage = path.join(folder, sid);
    await writeFile(storage, buffer, { mode: 0o600 });
  }
  if (!storage)
    throw new AppError("Private Blob storage is not configured", 503);
  let row;
  try {
    [row] = await query(
      "INSERT INTO discovery_sources(id,user_id,filename,sha256,pages,warnings,storage_path,storage_key,original_bytes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(user_id,sha256) DO UPDATE SET filename=discovery_sources.filename RETURNING id",
      [
        sid,
        user,
        name,
        sha,
        JSON.stringify(parsed.pages),
        JSON.stringify(parsed.warnings),
        storage,
        storageKey,
        buffer.length,
      ],
    );
  } catch (error) {
    if (storage) await scheduleDeletion(storage);
    throw error;
  }
  if (row.id !== sid && storage) await scheduleDeletion(storage);
  return { id: row.id, duplicate: row.id !== sid };
}
export async function discoveryUpload(
  user: string,
  name: string,
  buffer: Buffer,
  storage: string | null = null,
  storageKey: string | null = null,
) {
  const warnings: string[] = [];
  const files = discoveryFiles(name, buffer, (warning) =>
    warnings.push(warning),
  );
  const archive = name.toLowerCase().endsWith(".zip");
  const sources = [];
  for (const file of files)
    sources.push({
      ...(await discoverySource(
        user,
        file.name,
        file.buffer,
        archive ? null : storage,
        archive ? null : storageKey,
      )),
      bytes: file.buffer.length,
    });
  return { sources, warnings };
}
export async function simpleMetadata(user: string) {
  const [reports, sources, settings] = await Promise.all([
    query(
      "SELECT r.id,r.question,r.created_at,r.result IS NOT NULL AS ready,coalesce(r.result->>'summary','') AS summary FROM discovery_reports r WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100",
      [user],
    ),
    query(
      "SELECT id,filename,sha256,role,warnings,created_at,jsonb_array_length(pages) AS pages,(SELECT coalesce(sum(length(p->>'text')),0)::int FROM jsonb_array_elements(pages) p) AS characters FROM discovery_sources WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5000",
      [user],
    ),
    query(
      "SELECT provider,model,validation_threshold,product_context,openai_key IS NOT NULL AS has_openai_key,anthropic_key IS NOT NULL AS has_anthropic_key,groq_key IS NOT NULL AS has_groq_key,gemini_key IS NOT NULL AS has_gemini_key FROM settings WHERE user_id=$1",
      [user],
    ),
  ]);
  const hasOwnKey = !!settings[0]?.[`has_${settings[0]?.provider}_key`];
  const billing = await billingStatus(user);
  const retained =
    !billing.readUntil || new Date(billing.readUntil).getTime() > Date.now();
  return {
    reports: retained ? reports : [],
    sources: retained ? sources : [],
    billing,
    analysisReady: hasOwnKey && billing.active,
    analysisReadiness: !hasOwnKey
      ? "Connect your own AI provider in Settings. Provider charges are separate."
      : !billing.active
        ? "Subscribe for $10/month in Settings to start discovery."
        : "Your analysis connection is ready.",
    analysisProvider: settings[0]?.provider || "groq",
    settings: settings[0],
    hasOwnKey,
    uploadMode: blobEnabled() ? "blob" : "local",
  };
}
export async function reportDetail(
  user: string,
  rid: string,
): Promise<Record<string, any>> {
  const [report] = await query(
    "SELECT r.*,coalesce(root.recovery_count,r.recovery_count) AS recovery_attempts FROM discovery_reports r LEFT JOIN discovery_reports root ON root.id=r.recovery_root_id AND root.user_id=r.user_id WHERE r.id=$1 AND r.user_id=$2",
    [rid, user],
  );
  if (!report) throw new AppError("Report not found", 404);
  const [sources, jobs, warningChunks, validationWork] = await Promise.all([
    query(
      "SELECT s.id,s.filename,rs.role,s.warnings,jsonb_array_length(s.pages) AS pages FROM discovery_sources s JOIN discovery_report_sources rs ON rs.source_id=s.id AND rs.user_id=s.user_id WHERE rs.report_id=$1 AND rs.user_id=$2 ORDER BY s.created_at,s.id",
      [rid, user],
    ),
    query(
      "SELECT j.id,j.state,j.error,j.attempts,j.billing_mode,(SELECT count(*)::int FROM job_chunks WHERE job_id=j.id) AS total,(SELECT count(*)::int FROM job_chunks WHERE job_id=j.id AND completed) AS completed,(SELECT count(*)::int FROM job_reductions WHERE job_id=j.id) AS reduction_total,(SELECT count(*)::int FROM job_reductions WHERE job_id=j.id AND completed) AS reduction_completed,(SELECT coalesce(max(level),0)::int+1 FROM job_reductions WHERE job_id=j.id) AS reduction_pass FROM jobs j WHERE j.report_id=$1 AND j.user_id=$2 ORDER BY j.created_at DESC LIMIT 1",
      [rid, user],
    ),
    query(
      "SELECT c.chunk_index,c.input,c.warning FROM job_chunks c JOIN jobs j ON j.id=c.job_id WHERE j.id=(SELECT id FROM jobs WHERE report_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 1) AND c.warning IS NOT NULL ORDER BY c.chunk_index",
      [rid, user],
    ),
    query(
      `WITH RECURSIVE history AS (
        SELECT id,parent_id,ARRAY[id] AS path FROM discovery_reports WHERE id=$1 AND user_id=$2
        UNION ALL SELECT r.id,r.parent_id,h.path || r.id FROM discovery_reports r JOIN history h ON r.id=h.parent_id
        WHERE r.user_id=$2 AND NOT r.id=ANY(h.path) AND cardinality(h.path)<100
      ) SELECT w.* FROM discovery_validation_work w JOIN history h ON w.report_id=h.id
        WHERE w.user_id=$2 ORDER BY w.updated_at DESC LIMIT 100`,
      [rid, user],
    ),
  ]);
  const job = jobs[0];
  const result = report.result
    ? {
        ...report.result,
        opportunities: report.result.opportunities.map(
          (o: Record<string, unknown>, index: number) => ({
            ...o,
            id: opportunityId(rid, index),
          }),
        ),
      }
    : null;
  const partial = !!(
    result?.analysis_warnings?.length ||
    result?.coverage?.skipped_batches ||
    warningChunks.length ||
    (result?.coverage?.analyzed_sources !== undefined &&
      result.coverage.analyzed_sources < result.coverage.sources)
  );
  const active = job && ["queued", "processing"].includes(job.state);
  return {
    ...report,
    result,
    sources,
    validation_work: validationWork,
    analysis_status: active
      ? "analyzing"
      : job?.state === "failed"
        ? "needs_attention"
        : partial
          ? "partial"
          : result
            ? result.coverage
              ? "complete"
              : "coverage_unknown"
            : "needs_attention",
    can_recover: !!(
      result &&
      partial &&
      warningChunks.length &&
      !active &&
      report.recovery_attempts < 3
    ),
    job: job
      ? {
          ...job,
          // Older jobs spent the whole job budget on this source-level error.
          can_retry:
            job.attempts < 3 ||
            job.error ===
              "Groq could not generate a valid structured response. Retry analysis; completed source batches are preserved.",
        }
      : null,
    analysis_warnings: analysisWarnings(warningChunks),
  };
}

export async function retryOmittedMaterial(user: string, rid: string) {
  await assertWritableUser(user);
  const recovered = await transaction(async (c) => {
    const {
      rows: [source],
    } = await c.query(
      "SELECT * FROM discovery_reports WHERE id=$1 AND user_id=$2",
      [rid, user],
    );
    if (!source?.result)
      throw new AppError("Choose a saved partial report to recover.", 409);
    const rootId = source.recovery_root_id ?? source.id;
    const {
      rows: [root],
    } = await c.query(
      "SELECT * FROM discovery_reports WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [rootId, user],
    );
    const {
      rows: [active],
    } = await c.query(
      "SELECT r.id,j.id AS job FROM discovery_reports r JOIN jobs j ON j.report_id=r.id AND j.user_id=r.user_id WHERE r.recovery_of=$1 AND r.user_id=$2 AND (j.state IN ('queued','processing') OR (j.state='succeeded' AND NOT EXISTS(SELECT 1 FROM job_chunks WHERE job_id=j.id AND warning IS NOT NULL))) ORDER BY r.created_at DESC LIMIT 1",
      [rid, user],
    );
    if (active) return { id: active.id, job: active.job };
    if (root.recovery_count >= 3)
      throw new AppError(
        "Recovery limit reached. Review the omitted files and analysis connection before starting a new report.",
        409,
      );
    const {
      rows: [job],
    } = await c.query(
      "SELECT * FROM jobs WHERE report_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
      [rid, user],
    );
    if (!job || !["succeeded", "failed"].includes(job.state))
      throw new AppError("This analysis is already in progress.", 409);
    if (job.billing_mode === "included")
      throw new AppError(
        "This older report used app-funded AI. Connect your own provider and start a new discovery; your saved report remains available.",
        409,
      );
    await credentials(user, job.provider, c);
    const { rows: omitted } = await c.query(
      "SELECT chunk_index FROM job_chunks WHERE job_id=$1 AND warning IS NOT NULL",
      [job.id],
    );
    if (!omitted.length)
      throw new AppError("There is no omitted material to retry.", 409);
    const newReport = id(),
      newJob = id();
    await c.query(
      "UPDATE discovery_reports SET recovery_count=recovery_count+1 WHERE id=$1",
      [rootId],
    );
    await c.query(
      "INSERT INTO discovery_reports(id,user_id,question,product_context,parent_id,input_hash,import_warnings,recovery_root_id,recovery_of) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$5)",
      [
        newReport,
        user,
        source.question,
        source.product_context,
        rid,
        hash(`recovery:${rid}:${newReport}`),
        JSON.stringify(source.import_warnings),
        rootId,
      ],
    );
    await c.query(
      "INSERT INTO discovery_report_sources(user_id,report_id,source_id,role) SELECT user_id,$1,source_id,role FROM discovery_report_sources WHERE report_id=$2 AND user_id=$3",
      [newReport, rid, user],
    );
    await c.query(
      "INSERT INTO jobs(id,user_id,report_id,purpose,provider,model,prompt_version,billing_mode,source_hash) VALUES($1,$2,$3,'analyze',$4,$5,$6,$7,$8)",
      [
        newJob,
        user,
        newReport,
        job.provider,
        job.model,
        job.prompt_version,
        job.billing_mode,
        job.source_hash,
      ],
    );
    await c.query(
      `INSERT INTO job_chunks(job_id,chunk_index,source_start,source_end,input,completed,candidates,usage,attempts)
       SELECT $1,chunk_index,source_start,source_end,input,completed AND warning IS NULL,
       CASE WHEN warning IS NULL THEN candidates ELSE NULL END,CASE WHEN warning IS NULL THEN usage ELSE NULL END,
       CASE WHEN warning IS NULL THEN attempts ELSE 0 END FROM job_chunks WHERE job_id=$2`,
      [newJob, job.id],
    );
    return { id: newReport, job: newJob };
  });
  if (hostedJobs()) {
    const { dispatchJob } = await import("./dispatch");
    await dispatchJob(recovered.job).catch(() => {});
  }
  return recovered;
}
function analysisWarnings(chunks: any[]) {
  return chunks
    .filter((chunk) => chunk.warning)
    .map((chunk) => ({
      batch: chunk.chunk_index + 1,
      source_ids: [
        ...new Set<string>(chunk.input.map((p: any) => p.source_id)),
      ],
      filenames: [...new Set<string>(chunk.input.map((p: any) => p.filename))],
      message: chunk.warning as string,
    }));
}
const createInput = z.object({
  question: z.string().trim().max(500).default(""),
  product_context: z.string().trim().max(3000).optional(),
  sources: z
    .array(
      z.object({
        id: z.uuid(),
        role: z.enum(["auto", "customer", "context"]).default("auto"),
      }),
    )
    .min(1)
    .max(MAX_DISCOVERY_FILES),
  import_warnings: z.array(z.string().max(1000)).max(1001).default([]),
  parent_id: z.uuid().nullable().default(null),
});
export async function createReport(user: string, raw: unknown) {
  await assertWritableUser(user);
  const input = createInput.parse(raw);
  const submitted = input.sources;
  input.sources = uniqueSourceSelections(submitted) as typeof input.sources;
  if (input.sources.length < submitted.length) {
    const conflicts = submitted.some(
      (s) =>
        s.role === "context" &&
        submitted.some((other) => other.id === s.id && other.role !== s.role),
    );
    const notice = `${submitted.length - input.sources.length} duplicate source selection(s) automatically removed.${conflicts ? " Conflicting source types were kept as company context." : ""}`;
    input.import_warnings = [...input.import_warnings.slice(0, 1000), notice];
  }
  const [settings] = await query("SELECT * FROM settings WHERE user_id=$1", [
    user,
  ]);
  const billing = "byok";
  const provider = settings?.provider;
  if (!(providerIds as readonly string[]).includes(provider))
    throw new AppError("Connect your AI provider in Settings first");
  const model = settings.model;
  await credentials(user, provider);
  const result = await transaction(async (c) => {
    await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user]);
    const { rows: sources } = await c.query(
      "SELECT * FROM discovery_sources WHERE user_id=$1 AND id=ANY($2::uuid[]) ORDER BY id",
      [user, input.sources.map((s) => s.id)],
    );
    if (sources.length !== input.sources.length)
      throw new AppError(
        "A source is unavailable. Select your own sources again.",
        404,
      );
    let previous: any = null;
    if (input.parent_id) {
      const {
        rows: [parent],
      } = await c.query(
        "SELECT * FROM discovery_reports WHERE id=$1 AND user_id=$2",
        [input.parent_id, user],
      );
      if (!parent?.result)
        throw new AppError("Choose a completed report to update.");
      previous = parent;
    }
    const productContext =
      input.product_context ??
      previous?.product_context ??
      settings.product_context ??
      "";
    const total = sources.reduce(
      (n, s) => n + s.pages.reduce((m: number, p: any) => m + p.text.length, 0),
      0,
    );
    if (total > MAX_REPORT_CHARACTERS)
      throw new AppError(
        "This report exceeds 25 million text characters. Your imported sources are saved; select a smaller set for this report.",
      );
    const fingerprint = hash(
      JSON.stringify([
        REPORT_VERSION,
        billing,
        provider,
        model,
        input.question,
        productContext,
        input.parent_id,
        input.sources.slice().sort((a, b) => a.id.localeCompare(b.id)),
      ]),
    );
    const {
      rows: [cached],
    } = await c.query(
      "SELECT id FROM discovery_reports WHERE user_id=$1 AND input_hash=$2",
      [user, fingerprint],
    );
    if (cached) {
      if (input.import_warnings.length)
        await c.query(
          "UPDATE discovery_reports SET import_warnings=$1 WHERE id=$2 AND user_id=$3",
          [JSON.stringify(input.import_warnings), cached.id, user],
        );
      return { id: cached.id, cached: true };
    }
    const { rows: old } = previous
      ? await c.query(
          "SELECT source_id,role FROM discovery_report_sources WHERE report_id=$1 AND user_id=$2",
          [previous.id, user],
        )
      : { rows: [] };
    const unchanged = new Set(
      old
        .filter((o) =>
          input.sources.some((s) => s.id === o.source_id && s.role === o.role),
        )
        .map((o) => o.source_id),
    );
    if (
      previous &&
      unchanged.size === sources.length &&
      old.length === sources.length &&
      previous.question === input.question &&
      previous.product_context === productContext
    ) {
      if (input.import_warnings.length)
        await c.query(
          "UPDATE discovery_reports SET import_warnings=$1 WHERE id=$2 AND user_id=$3",
          [JSON.stringify(input.import_warnings), previous.id, user],
        );
      return { id: previous.id, cached: true };
    }
    const rid = id(),
      jid = id();
    await c.query(
      "INSERT INTO discovery_reports(id,user_id,question,product_context,parent_id,input_hash,import_warnings) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        rid,
        user,
        input.question,
        productContext,
        input.parent_id,
        fingerprint,
        JSON.stringify(input.import_warnings),
      ],
    );
    for (const s of input.sources)
      await c.query(
        "INSERT INTO discovery_report_sources(user_id,report_id,source_id,role) VALUES($1,$2,$3,$4)",
        [user, rid, s.id, s.role],
      );
    await c.query(
      "INSERT INTO jobs(id,user_id,report_id,purpose,provider,model,prompt_version,billing_mode,source_hash) VALUES($1,$2,$3,'analyze',$4,$5,$6,$7,$8)",
      [jid, user, rid, provider, model, REPORT_VERSION, billing, fingerprint],
    );
    return { id: rid, job: jid, cached: false };
  });
  if (result.job && hostedJobs()) {
    const { dispatchJob } = await import("./dispatch");
    await dispatchJob(result.job).catch(() => {});
  }
  return result;
}
async function snapshot(c: pg.PoolClient, job: any) {
  const {
    rows: [report],
  } = await c.query(
    "SELECT * FROM discovery_reports WHERE id=$1 AND user_id=$2",
    [job.report_id, job.user_id],
  );
  if (!report) throw new AppError("Report is unavailable", 404);
  const { rows: sources } = await c.query(
    "SELECT s.*,rs.role FROM discovery_sources s JOIN discovery_report_sources rs ON rs.source_id=s.id AND rs.user_id=s.user_id WHERE rs.report_id=$1 AND rs.user_id=$2 ORDER BY s.id",
    [report.id, job.user_id],
  );
  const {
    rows: [parent],
  } = report.parent_id
    ? await c.query(
        "SELECT result FROM discovery_reports WHERE id=$1 AND user_id=$2",
        [report.parent_id, job.user_id],
      )
    : { rows: [] };
  const { rows: old } = parent
    ? await c.query(
        "SELECT source_id,role FROM discovery_report_sources WHERE report_id=$1 AND user_id=$2",
        [report.parent_id, job.user_id],
      )
    : { rows: [] };
  const unchanged = new Set(
    old
      .filter(
        (o) =>
          sources.some((s) => s.id === o.source_id && s.role === o.role) &&
          !(parent?.result?.analysis_warnings ?? []).some(
            (w: { source_ids: string[] }) => w.source_ids.includes(o.source_id),
          ),
      )
      .map((o) => o.source_id),
  );
  return {
    report,
    sources: sources as DiscoverySource[],
    previous: parent?.result,
    reused: (parent?.result?.findings ?? []).filter((f: Finding) =>
      unchanged.has(f.source_id),
    ),
    unchanged,
  };
}
export async function prepareAnalysis(c: pg.PoolClient, job: any) {
  // Recovered jobs retain the exact old boundaries and successful checkpoints.
  const {
    rows: [existing],
  } = await c.query(
    "SELECT count(*)::int AS count,max(chunk_index)::int AS last FROM job_chunks WHERE job_id=$1",
    [job.id],
  );
  if (existing.count) return existing.last + 1;
  const { sources, unchanged } = await snapshot(c, job);
  const chunks: any[][] = [];
  let current: any[] = [],
    size = 0;
  const chunkSize = job.provider === "groq" ? 7000 : 16000;
  const maxSize = job.provider === "groq" ? 8000 : 18000;
  for (const source of sources.filter((s) => !unchanged.has(s.id))) {
    for (const [page_index, p] of source.pages.entries())
      for (let start = 0; start < p.text.length; start += chunkSize) {
        const text = p.text.slice(start, start + chunkSize);
        if (text.trim().length < 5) continue;
        const passageSize =
          text.length + source.filename.length + p.label.length + 250;
        if (size + passageSize > maxSize && current.length) {
          chunks.push(current);
          current = [];
          size = 0;
        }
        current.push({
          source_id: source.id,
          page_index,
          label: p.label,
          filename: source.filename,
          role: source.role,
          text,
          start,
        });
        size += passageSize;
      }
    // Keep old job boundaries stable; new reports isolate failures to one document.
    if (job.prompt_version === REPORT_VERSION && current.length) {
      chunks.push(current);
      current = [];
      size = 0;
    }
  }
  if (current.length) chunks.push(current);
  if (chunks.length > MAX_ANALYSIS_CHUNKS)
    throw new AppError(
      "This report exceeds 5,000 source batches. Your imported sources are saved; select a smaller set.",
    );
  for (let offset = 0; offset < chunks.length; offset += 50) {
    const batch = chunks
      .slice(offset, offset + 50)
      .map((input, i) => ({ chunk_index: offset + i, input }));
    await c.query(
      "INSERT INTO job_chunks(job_id,chunk_index,source_start,source_end,input) SELECT $1,x.chunk_index,0,0,x.input FROM jsonb_to_recordset($2::jsonb) AS x(chunk_index integer,input jsonb) ON CONFLICT DO NOTHING",
      [job.id, JSON.stringify(batch)],
    );
  }
  return chunks.length;
}
export async function analyzeChunk(c: pg.PoolClient, job: any, chunk: any) {
  let response, findings: Finding[];
  try {
    let grounded;
    try {
      grounded =
        job.provider === "groq" ? groundedFindingRequest(chunk.input) : null;
    } catch {
      throw new ProviderError(
        "No quotable source passages were available in this batch.",
      );
    }
    response = await generate<unknown>(
      job.user_id,
      job.provider,
      job.model,
      findingPrompt +
        " " +
        relationshipPrompt +
        (grounded
          ? " Select passage_id from the supplied quotes; original quote text and source references are attached by the server."
          : ""),
      grounded?.input ?? JSON.stringify(chunk.input),
      grounded?.schema ?? findingsSchema,
      "discovery_findings",
      c,
      job.billing_mode === "included",
    );
    try {
      findings = verifyFindings(
        grounded
          ? grounded.resolve(response.data)
          : findingsSchema.parse(response.data),
        chunk.input,
      );
    } catch (e) {
      throw new ProviderError((e as Error).message, true);
    }
  } catch (error) {
    // Database and rate-limit failures must keep their normal recovery behavior.
    if (!(error instanceof ProviderError)) throw error;
    const attempts = (chunk.attempts ?? 0) + 1;
    await c.query(
      "UPDATE job_chunks SET attempts=$1 WHERE job_id=$2 AND chunk_index=$3",
      [attempts, job.id, chunk.chunk_index],
    );
    if (error.retryable && attempts < 3) return error.retryAfterSeconds ?? 2;
    await c.query(
      "UPDATE job_chunks SET candidates=$1,usage=$2,completed=true,warning=$5 WHERE job_id=$3 AND chunk_index=$4",
      ["[]", "{}", job.id, chunk.chunk_index, error.message],
    );
    return 0;
  }
  await c.query(
    "UPDATE job_chunks SET candidates=$1,usage=$2,completed=true WHERE job_id=$3 AND chunk_index=$4",
    [
      JSON.stringify(findings),
      JSON.stringify(response.usage),
      job.id,
      chunk.chunk_index,
    ],
  );
}
async function analysisEvidence(c: pg.PoolClient, job: any) {
  const { report, sources, previous, reused } = await snapshot(c, job);
  const { rows: chunks } = await c.query(
    "SELECT * FROM job_chunks WHERE job_id=$1 ORDER BY chunk_index",
    [job.id],
  );
  if (chunks.some((x) => !x.completed))
    throw new AppError("Analysis is still reading sources.");
  if (chunks.length && chunks.every((x) => x.warning) && !reused.length)
    throw new AppError(
      `No source batches could be analyzed. ${chunks[0].warning} Review the analysis warnings and retry.`,
    );
  const findings = [
    ...new Map(
      [...reused, ...chunks.flatMap((x) => x.candidates ?? [])].map(
        (f: Finding) => {
          const fid = hash(
            [f.source_id, f.page_index, f.source_start, f.quote].join("\0"),
          ).slice(0, 20);
          return [fid, { ...f, id: fid }];
        },
      ),
    ).values(),
  ] as Finding[];
  return { report, sources, previous, chunks, findings };
}
export async function prepareEvidenceReduction(
  c: pg.PoolClient,
  job: any,
  level: number,
) {
  if (level >= MAX_REDUCTION_LEVELS)
    throw new AppError(
      "This evidence set needs a smaller report. Your completed analysis is saved.",
    );
  let findings: Finding[];
  if (level === 0) findings = (await analysisEvidence(c, job)).findings;
  else {
    const { rows: previous } = await c.query(
      "SELECT * FROM job_reductions WHERE job_id=$1 AND level=$2 ORDER BY batch_index",
      [job.id, level - 1],
    );
    if (!previous.length || previous.some((row) => !row.completed))
      throw new AppError("Evidence aggregation is not complete.");
    findings = previous.flatMap((row) =>
      selectedEvidence(row.input, row.selected_ids),
    );
  }
  const groups = evidenceGroups(findings);
  for (const [index, input] of groups.entries())
    await c.query(
      "INSERT INTO job_reductions(job_id,level,batch_index,input) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [job.id, level, index, JSON.stringify(input)],
    );
  return groups.length;
}
export async function reduceEvidence(
  c: pg.PoolClient,
  job: any,
  level: number,
  index: number,
) {
  const {
    rows: [batch],
  } = await c.query(
    "SELECT * FROM job_reductions WHERE job_id=$1 AND level=$2 AND batch_index=$3 FOR UPDATE",
    [job.id, level, index],
  );
  if (!batch || batch.completed) return;
  const {
    rows: [report],
  } = await c.query(
    "SELECT question,product_context FROM discovery_reports WHERE id=$1 AND user_id=$2",
    [job.report_id, job.user_id],
  );
  const schema = evidenceSelectionSchema(batch.input).required({
    risk_ids: true,
  });
  const selection_limits = Object.fromEntries(
    Object.entries(z.toJSONSchema(schema).properties ?? {}).map(
      ([key, value]) => [key, (value as { maxItems?: number }).maxItems ?? 0],
    ),
  );
  const response = await generate(
    job.user_id,
    job.provider,
    job.model,
    evidenceSelectionPrompt,
    JSON.stringify({ ...report, selection_limits, findings: batch.input }),
    schema,
    "evidence_selection",
    c,
    job.billing_mode === "included",
  );
  const ids = [
    ...new Set([
      ...response.data.supporting_ids,
      ...response.data.opposing_ids,
      ...response.data.context_ids,
      ...(response.data.risk_ids ?? []),
    ]),
  ];
  selectedEvidence(batch.input, ids);
  await c.query(
    "UPDATE job_reductions SET selected_ids=$1,usage=$2,completed=true WHERE job_id=$3 AND level=$4 AND batch_index=$5",
    [JSON.stringify(ids), JSON.stringify(response.usage), job.id, level, index],
  );
}
export async function publishAnalysis(c: pg.PoolClient, job: any) {
  const {
    report,
    sources,
    previous,
    chunks,
    findings: allFindings,
  } = await analysisEvidence(c, job);
  const { rows: reductions } = await c.query(
    "SELECT * FROM job_reductions WHERE job_id=$1 ORDER BY level,batch_index",
    [job.id],
  );
  if (reductions.some((batch) => !batch.completed))
    throw new AppError("Evidence aggregation is not complete.");
  const lastLevel = reductions.at(-1)?.level;
  const findings =
    lastLevel === undefined
      ? allFindings
      : reductions
          .filter((row) => row.level === lastLevel)
          .flatMap((row) => selectedEvidence(row.input, row.selected_ids));
  const payload = JSON.stringify({
    question: report.question,
    product_context: report.product_context,
    findings,
    source_coverage: {
      selected_sources: sources.length,
      omitted_batches: chunks.filter((x) => x.warning).length,
    },
    previous: previous
      ? { summary: previous.summary, opportunities: previous.opportunities }
      : null,
  });
  if (payload.length > 450000)
    throw new AppError(
      "Too much evidence for a concise report. Analyze a smaller set of sources.",
    );
  const response = await generate(
    job.user_id,
    job.provider,
    job.model,
    reportPrompt,
    payload,
    job.provider === "groq" || job.provider === "gemini"
      ? groundedReportSchema(findings, true)
      : preciseReportSchema,
    "opportunity_report",
    c,
    job.billing_mode === "included",
  );
  let result;
  try {
    result = validateReport(response.data, findings);
  } catch (e) {
    throw new ProviderError((e as Error).message, true);
  }
  if (!previous) result.changes = [];
  result.analysis_warnings = analysisWarnings(chunks);
  const incompleteSources = new Set(
    result.analysis_warnings.flatMap((w) => w.source_ids),
  );
  result.coverage = {
    sources: sources.length,
    batches: chunks.length,
    analyzed_sources: sources.filter((s) => !incompleteSources.has(s.id))
      .length,
    skipped_batches: result.analysis_warnings.length,
    verified_findings: allFindings.length,
    selected_findings: findings.length,
  };
  await ensureResearchCompanies(c, job.user_id, sources, allFindings);
  await c.query(
    "UPDATE discovery_reports SET result=$1 WHERE id=$2 AND user_id=$3",
    [JSON.stringify(result), report.id, job.user_id],
  );
  await c.query(
    "UPDATE jobs SET state='succeeded',usage=$1,result=$2,finished_at=now(),locked_at=NULL,error=NULL WHERE id=$3",
    [
      JSON.stringify([
        ...chunks.map((x) => x.usage),
        ...reductions.map((x) => x.usage),
        response.usage,
      ]),
      JSON.stringify({
        opportunities: result.opportunities.length,
        sources: sources.length,
      }),
      job.id,
    ],
  );
}
