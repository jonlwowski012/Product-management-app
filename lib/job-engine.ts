import { id, AppError, transaction, assertWritableUser } from "./db";
import { GroqRateWait } from "./groq-limits";
import {
  generate,
  extractionPrompt,
  extractionSchema,
  briefDraftSchema,
  briefPrompt,
  ProviderError,
} from "./ai";
import { verifyQuote, fingerprint, optionsValid } from "./domain";
import {
  prepareAnalysis,
  analyzeChunk,
  publishAnalysis,
  prepareEvidenceReduction,
  reduceEvidence,
} from "./reports";

export function chunkRanges(raw: string) {
  const ranges: { start: number; end: number }[] = [];
  let start = 0,
    end = 0;
  for (const line of raw.split(/(?<=\n)/)) {
    if (line.length > 24000)
      throw new AppError(
        "A transcript line exceeds 24,000 characters; split it into timestamped turns",
      );
    if (end - start + line.length > 18000 && end > start) {
      ranges.push({ start, end });
      start = end;
    }
    end += line.length;
  }
  if (end > start) ranges.push({ start, end });
  return ranges;
}
export async function prepareJob(jid: string) {
  return transaction(async (c) => {
    const {
      rows: [job],
    } = await c.query("SELECT * FROM jobs WHERE id=$1 FOR UPDATE", [jid]);
    if (!job || job.state === "succeeded" || job.state === "failed") return 0;
    await assertWritableUser(job.user_id, c);
    await c.query(
      "UPDATE jobs SET state='processing',locked_at=now(),attempts=greatest(attempts,1) WHERE id=$1",
      [jid],
    );
    if (job.purpose === "brief") return 0;
    if (job.purpose === "analyze") return prepareAnalysis(c, job);
    const {
      rows: [t],
    } = await c.query("SELECT * FROM transcripts WHERE id=$1 AND user_id=$2", [
      job.transcript_id,
      job.user_id,
    ]);
    if (!t) throw new AppError("Transcript removed", 404);
    if (t.sha256 !== job.source_hash)
      throw new AppError("Original transcript changed; start a new extraction");
    const chunks = chunkRanges(t.raw_text);
    for (let i = 0; i < chunks.length; i++)
      await c.query(
        "INSERT INTO job_chunks(job_id,chunk_index,source_start,source_end) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [jid, i, chunks[i].start, chunks[i].end],
      );
    return chunks.length;
  });
}
export async function processChunk(jid: string, index: number) {
  return transaction(async (c) => {
    const {
      rows: [chunk],
    } = await c.query(
      "SELECT * FROM job_chunks WHERE job_id=$1 AND chunk_index=$2 FOR UPDATE",
      [jid, index],
    );
    if (!chunk || chunk.completed) return;
    const {
      rows: [job],
    } = await c.query("SELECT * FROM jobs WHERE id=$1", [jid]);
    if (!job || job.state !== "processing") return;
    await assertWritableUser(job.user_id, c);
    if (job.purpose === "analyze") return analyzeChunk(c, job, chunk);
    const {
      rows: [t],
    } = await c.query("SELECT * FROM transcripts WHERE id=$1 AND user_id=$2", [
      job.transcript_id,
      job.user_id,
    ]);
    if (!t) throw new AppError("Transcript removed", 404);
    await c.query("UPDATE jobs SET locked_at=now() WHERE id=$1", [jid]);
    const response = await generate(
      job.user_id,
      job.provider,
      job.model,
      extractionPrompt,
      t.raw_text.slice(chunk.source_start, chunk.source_end),
      extractionSchema,
      "discovery_signals",
      c,
    );
    await c.query(
      "UPDATE job_chunks SET candidates=$1,usage=$2,completed=true WHERE job_id=$3 AND chunk_index=$4",
      [
        JSON.stringify(response.data.signals),
        JSON.stringify(response.usage),
        jid,
        index,
      ],
    );
  });
}
export async function prepareReductionJob(jid: string, level: number) {
  return transaction(async (c) => {
    const {
      rows: [job],
    } = await c.query("SELECT * FROM jobs WHERE id=$1 FOR UPDATE", [jid]);
    if (!job || job.state !== "processing" || job.purpose !== "analyze")
      return 0;
    await assertWritableUser(job.user_id, c);
    return prepareEvidenceReduction(c, job, level);
  });
}
export async function reduceJob(jid: string, level: number, index: number) {
  return transaction(async (c) => {
    const {
      rows: [job],
    } = await c.query("SELECT * FROM jobs WHERE id=$1", [jid]);
    if (!job || job.state !== "processing" || job.purpose !== "analyze") return;
    await assertWritableUser(job.user_id, c);
    await reduceEvidence(c, job, level, index);
  });
}
export async function publishJob(jid: string) {
  await transaction(async (c) => {
    const {
      rows: [job],
    } = await c.query("SELECT * FROM jobs WHERE id=$1 FOR UPDATE", [jid]);
    if (!job || job.state !== "processing") return;
    await assertWritableUser(job.user_id, c);
    if (job.purpose === "analyze") return publishAnalysis(c, job);
    let result: unknown,
      usage: unknown[] = [];
    if (job.purpose === "extract") {
      const {
        rows: [t],
      } = await c.query(
        "SELECT * FROM transcripts WHERE id=$1 AND user_id=$2",
        [job.transcript_id, job.user_id],
      );
      if (!t) throw new AppError("Transcript removed", 404);
      const { rows: chunks } = await c.query(
        "SELECT * FROM job_chunks WHERE job_id=$1 ORDER BY chunk_index",
        [jid],
      );
      if (!chunks.length || chunks.some((x) => !x.completed))
        throw new AppError("Extraction checkpoints are incomplete");
      const candidates = chunks.flatMap(
        (x) => x.candidates,
      ) as import("zod").infer<typeof extractionSchema>["signals"];
      usage = chunks.map((x) => x.usage);
      let inserted = 0;
      let flagged = 0;
      for (const candidate of candidates) {
        const v = verifyQuote(t.raw_text, candidate.quote, t.segments);
        const sid = id();
        if (!v.verified) flagged++;
        const { rows } = await c.query(
          `INSERT INTO signals(id,user_id,customer_id,transcript_id,source_key,title,quote,source_start,source_end,timestamp,speaker,verified,verification_reason,kind,sentiment,tier,commitments,ai_proposal)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
 ON CONFLICT(user_id,transcript_id,source_key) DO UPDATE SET ai_proposal=EXCLUDED.ai_proposal RETURNING id,(xmax=0) AS inserted`,
          [
            sid,
            job.user_id,
            t.customer_id,
            t.id,
            fingerprint(candidate.quote, candidate.kind),
            candidate.title,
            candidate.quote,
            v.start,
            v.end,
            v.timestamp,
            v.speaker,
            v.verified,
            v.reason,
            candidate.kind,
            candidate.sentiment,
            candidate.tier,
            candidate.commitments,
            JSON.stringify(candidate),
          ],
        );
        if (rows[0].inserted) inserted++;
      }

      result = { candidates: candidates.length, inserted, flagged };
    } else {
      const {
        rows: [b],
      } = await c.query("SELECT * FROM briefs WHERE id=$1 AND user_id=$2", [
        job.brief_id,
        job.user_id,
      ]);
      if (!b) throw new AppError("Brief removed", 404);
      const { rows: evidence } = await c.query(
        `SELECT s.id,s.title,s.quote,s.sentiment,s.tier,c.name AS customer
        FROM signals s JOIN customers c ON c.id=s.customer_id AND c.user_id=s.user_id
        WHERE s.user_id=$1 AND s.verified AND s.review='approved' AND s.stage='signal' AND
        (EXISTS(SELECT 1 FROM brief_signals b WHERE b.brief_id=$2 AND b.signal_id=s.id AND b.user_id=$1) OR
         EXISTS(SELECT 1 FROM feature_signals fs JOIN brief_features bf ON bf.feature_id=fs.feature_id AND bf.user_id=fs.user_id WHERE bf.brief_id=$2 AND fs.signal_id=s.id AND fs.user_id=$1)) ORDER BY s.id`,
        [job.user_id, b.id],
      );
      if (Buffer.byteLength(JSON.stringify(evidence)) > 180000)
        throw new AppError(
          "This brief has too much evidence for one AI request. Reduce the linked evidence before drafting.",
        );
      if (!evidence.length)
        throw new AppError(
          "Link approved, verified signals before requesting a brief draft",
        );
      const response = await generate(
        job.user_id,
        job.provider,
        job.model,
        briefPrompt,
        JSON.stringify({ title: b.title, evidence }),
        briefDraftSchema,
        "decision_brief",
        c,
      );

      if (!optionsValid(response.data.options))
        throw new AppError(
          "AI omitted the required baseline options; draft rejected",
        );
      const allowed = new Set(evidence.map((e) => e.id));
      if (response.data.evidence_ids.some((x) => !allowed.has(x)))
        throw new AppError(
          "AI cited evidence outside this brief; draft rejected",
        );
      await c.query(
        "UPDATE briefs SET ai_proposal=$1 WHERE id=$2 AND user_id=$3",
        [JSON.stringify(response.data), b.id, job.user_id],
      );

      usage = [response.usage];
      result = { draftReady: true };
    }
    await c.query(
      "UPDATE jobs SET state='succeeded',usage=$1,result=$2,finished_at=now(),locked_at=NULL,error=NULL WHERE id=$3",
      [JSON.stringify(usage), JSON.stringify(result), jid],
    );
    await c.query(
      "INSERT INTO audit(id,user_id,action,entity_type,entity_id,detail) VALUES($1,$2,'AI draft completed',$3,$4,$5)",
      [
        id(),
        job.user_id,
        job.purpose,
        job.transcript_id ?? job.brief_id,
        JSON.stringify(result),
      ],
    );
  });
}
export async function recordFailure(
  jid: string,
  error: unknown,
  localRetry = false,
  attempt?: string,
) {
  await transaction(async (c) => {
    const {
      rows: [job],
    } = await c.query("SELECT * FROM jobs WHERE id=$1 FOR UPDATE", [jid]);
    if (
      !job ||
      job.state === "succeeded" ||
      job.state === "failed" ||
      (attempt !== undefined && job.dispatch_token !== attempt)
    )
      return;
    const retry =
      localRetry &&
      (error instanceof GroqRateWait ||
        (error instanceof ProviderError &&
          error.retryable &&
          job.attempts < 3));
    const message =
      error instanceof AppError || error instanceof GroqRateWait
        ? error.message
        : (job.error ??
          "Processing interrupted. Retry this job; completed chunks are preserved.");
    await c.query(
      "UPDATE jobs SET state=$1,error=$2,available_at=now()+($4::int * interval '1 second'),locked_at=NULL,attempts=CASE WHEN $5 THEN greatest(0,attempts-1) ELSE attempts END,finished_at=CASE WHEN $1='failed' THEN now() ELSE NULL END WHERE id=$3",
      [
        retry ? "queued" : "failed",
        message,
        jid,
        error instanceof GroqRateWait
          ? error.seconds
          : error instanceof ProviderError
            ? (error.retryAfterSeconds ?? 2)
            : 2,
        error instanceof GroqRateWait,
      ],
    );
  });
}
