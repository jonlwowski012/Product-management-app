import { query, owned, id, AppError, audit, assertWritableUser } from "./db";
import { credentials } from "./ai";
import {
  prepareJob,
  processChunk,
  publishJob,
  recordFailure,
  prepareReductionJob,
  reduceJob,
} from "./job-engine";
export async function enqueue(
  user: string,
  purpose: "extract" | "brief",
  target: string,
) {
  await assertWritableUser(user);
  const record = await owned(
    purpose === "extract" ? "transcripts" : "briefs",
    target,
    user,
  );
  const [s] = await query(
    "SELECT provider,model FROM settings WHERE user_id=$1",
    [user],
  );
  await credentials(user, s.provider);
  const jid = id();
  try {
    await query(
      "INSERT INTO jobs(id,user_id,transcript_id,brief_id,purpose,provider,model,source_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        jid,
        user,
        purpose === "extract" ? target : null,
        purpose === "brief" ? target : null,
        purpose,
        s.provider,
        s.model,
        record.sha256 ?? String(record.version),
      ],
    );
  } catch (e) {
    if ((e as { code: string }).code === "23505")
      throw new AppError("This item already has an active processing job", 409);
    throw e;
  }
  if (purpose === "extract")
    await query(
      `INSERT INTO job_chunks(job_id,chunk_index,source_start,source_end,completed,candidates,usage)
    SELECT DISTINCT ON (c.chunk_index) $1::uuid,c.chunk_index,c.source_start,c.source_end,c.completed,c.candidates,c.usage
    FROM job_chunks c JOIN jobs j ON j.id=c.job_id
    WHERE j.user_id=$2 AND j.transcript_id=$3 AND j.state='failed' AND j.provider=$4 AND j.model=$5 AND j.source_hash=$6 AND j.prompt_version='1' AND c.completed
    ORDER BY c.chunk_index,j.created_at DESC ON CONFLICT DO NOTHING`,
      [jid, user, target, s.provider, s.model, record.sha256],
    );
  await audit(user, "AI draft requested", purpose, target, {
    provider: s.provider,
    model: s.model,
  });
  if (
    ["workflow", "netlify"].includes(process.env.JOB_RUNNER || "") ||
    process.env.VERCEL
  ) {
    const { dispatchJob } = await import("./dispatch");
    await dispatchJob(jid).catch(() => {}); // Committed outbox is recovered by cron.
  }
  return jid;
}

// Local development runner. Hosted execution uses the same checkpointed steps.
export async function runOne() {
  const [job] = await query(
    "UPDATE jobs SET state='processing',locked_at=now(),attempts=attempts+1,error=NULL WHERE id=(SELECT id FROM jobs WHERE user_id IN (SELECT id FROM users WHERE NOT is_demo) AND ((state='queued' AND available_at<=now()) OR (state='processing' AND locked_at<now()-interval '5 minutes')) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *",
  );
  if (!job) return false;
  try {
    const count = await prepareJob(job.id);
    for (let i = 0; i < count; i++) {
      const wait = await processChunk(job.id, i);
      if (wait) {
        await query(
          "UPDATE jobs SET state='queued',available_at=now()+($2::int * interval '1 second'),locked_at=NULL,attempts=greatest(0,attempts-1) WHERE id=$1",
          [job.id, wait],
        );
        return true;
      }
    }
    for (let level = 0; ; level++) {
      const groups = await prepareReductionJob(job.id, level);
      if (!groups) break;
      for (let i = 0; i < groups; i++) await reduceJob(job.id, level, i);
    }
    await publishJob(job.id);
  } catch (error) {
    await recordFailure(job.id, error, true);
  }
  return true;
}
