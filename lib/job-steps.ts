import { FatalError, RetryableError } from "workflow";
import { GroqRateWait } from "./groq-limits";
import {
  prepareJob,
  processChunk,
  publishJob,
  recordFailure,
  prepareReductionJob,
  reduceJob,
} from "./job-engine";
import { AppError, query } from "./db";
import { ProviderError } from "./ai";
async function safe<T>(
  jid: string,
  attempt: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof GroqRateWait) throw error;
    if (error instanceof ProviderError && error.retryable) {
      const [job] = await query(
        "SELECT attempts FROM jobs WHERE id=$1 AND dispatch_token=$2",
        [jid, attempt],
      );
      if (!job || job.attempts >= 3) {
        await recordFailure(jid, error, false, attempt);
        throw new FatalError(
          "AI provider retries exhausted. See the job status.",
        );
      }
      await query(
        "UPDATE jobs SET attempts=least(3,attempts+1),error=$1,available_at=now()+($4::int * interval '1 second') WHERE id=$2 AND dispatch_token=$3 AND state IN ('queued','processing')",
        [error.message, jid, attempt, error.retryAfterSeconds ?? 2],
      );
      throw new RetryableError("AI provider temporarily unavailable", {
        retryAfter: error.retryAfterSeconds
          ? `${error.retryAfterSeconds}s`
          : "2s",
      });
    }
    if (error instanceof AppError) {
      await recordFailure(jid, error, false, attempt);
      throw new FatalError("AI draft failed validation. See the job status.");
    }
    // Do not leak source data or SQL parameter values through SDK error logs.
    throw new RetryableError("Processing service temporarily unavailable", {
      retryAfter: "2s",
    });
  }
}
async function rateLimited(
  jid: string,
  attempt: string,
  fn: () => Promise<number | void>,
) {
  try {
    const wait = await safe(jid, attempt, fn);
    if (wait) {
      await query(
        "UPDATE jobs SET locked_at=now(),available_at=now()+($3::int * interval '1 second') WHERE id=$1 AND dispatch_token=$2",
        [jid, attempt, wait],
      );
      return wait;
    }
    await query(
      "UPDATE jobs SET error=NULL,locked_at=now(),available_at=now() WHERE id=$1 AND dispatch_token=$2",
      [jid, attempt],
    );
    return 0;
  } catch (error) {
    if (!(error instanceof GroqRateWait)) throw error;
    await query(
      "UPDATE jobs SET error=$1,locked_at=now(),available_at=now()+($4::int * interval '1 second') WHERE id=$2 AND dispatch_token=$3",
      [error.message, jid, attempt, error.seconds],
    );
    return error.seconds;
  }
}
export async function prepare(jid: string, attempt: string) {
  return safe(jid, attempt, () => prepareJob(jid));
}
export async function extract(
  jid: string,
  index: number,
  count: number,
  attempt: string,
) {
  return rateLimited(jid, attempt, async () => {
    for (let offset = 0; offset < count; offset++) {
      const wait = await processChunk(jid, index + offset);
      if (wait) {
        await query(
          "UPDATE jobs SET locked_at=now(),available_at=now()+($3::int * interval '1 second') WHERE id=$1 AND dispatch_token=$2",
          [jid, attempt, wait],
        );
        return wait;
      }
    }
  });
}
export async function publish(jid: string, attempt: string) {
  return rateLimited(jid, attempt, () => publishJob(jid));
}
export async function failed(jid: string, attempt: string) {
  await recordFailure(jid, new Error("Workflow stopped"), false, attempt);
}

export async function planReduction(
  jid: string,
  level: number,
  attempt: string,
) {
  return safe(jid, attempt, () => prepareReductionJob(jid, level));
}
export async function reduce(
  jid: string,
  level: number,
  index: number,
  count: number,
  attempt: string,
) {
  return rateLimited(jid, attempt, async () => {
    for (let offset = 0; offset < count; offset++)
      await reduceJob(jid, level, index + offset);
  });
}
