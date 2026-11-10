import {
  asyncWorkloadFn,
  ErrorDoNotRetry,
  ErrorRetryAfterDelay,
  type AsyncWorkloadEvent,
} from "@netlify/async-workloads";
import { FatalError, RetryableError } from "workflow";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type * as jobActions from "../../lib/job-steps";
import type { query as database } from "../../lib/db";
const eventSchema = z.object({ jobId: z.uuid(), attempt: z.uuid() });
// PostgreSQL holds the checkpoints; queue events contain only job and attempt IDs.
export async function analysisWorkload(
  event: AsyncWorkloadEvent,
  actions: typeof jobActions,
  query: typeof database,
) {
  const parsed = eventSchema.safeParse(event.eventData);
  if (!parsed.success) throw new ErrorDoNotRetry("Invalid analysis event");
  const { jobId, attempt } = parsed.data,
    stopAt = Date.now() + 8 * 60 * 1000;
  const defer = (message: string, retryDelay: number) =>
    new ErrorRetryAfterDelay({ message, retryDelay, forceDelayTime: true });
  const run = async <T,>(fn: () => Promise<T>): Promise<T> => {
    for (let retry = 0; ; retry++) {
      if (Date.now() >= stopAt) throw defer("Continue saved analysis", 1000);
      try {
        const [active] = await query(
          "UPDATE jobs SET locked_at=now() WHERE id=$1 AND dispatch_token=$2 AND state IN ('queued','processing') RETURNING id,greatest(0,ceil(extract(epoch from (available_at-now()))*1000))::bigint AS wait_ms",
          [jobId, attempt],
        );
        if (!active)
          throw new ErrorDoNotRetry("Analysis attempt is no longer active");
        if (Number(active.wait_ms) > 0)
          throw defer("AI retry delay", Number(active.wait_ms));
        return await fn();
      } catch (error) {
        if (
          error instanceof ErrorDoNotRetry ||
          error instanceof ErrorRetryAfterDelay
        )
          throw error;
        if (
          error instanceof RetryableError &&
          error.message !== "Processing service temporarily unavailable"
        )
          throw defer(
            "AI provider temporarily unavailable",
            Math.max(1000, error.retryAfter.getTime() - Date.now()),
          );
        if (!(error instanceof FatalError) && retry < 2) {
          await delay(2000);
          continue;
        }
        await actions.failed(jobId, attempt).catch(() => {});
        throw new ErrorDoNotRetry("Analysis stopped; see its saved status");
      }
    }
  };
  const rateLimited = async (fn: () => Promise<number | void>) => {
    const wait = await fn();
    if (wait) throw defer("AI retry delay", wait * 1000);
  };
  const count = await run(() => actions.prepare(jobId, attempt));
  const chunks = await run(() =>
    query("SELECT chunk_index FROM job_chunks WHERE job_id=$1 AND completed", [
      jobId,
    ]),
  );
  const completedChunks = new Set(chunks.map((row) => Number(row.chunk_index)));
  for (let index = 0; index < count; index += 2) {
    if (
      Array.from(
        { length: Math.min(2, count - index) },
        (_, offset) => index + offset,
      ).every((i) => completedChunks.has(i))
    )
      continue;
    await run(() =>
      rateLimited(() =>
        actions.extract(jobId, index, Math.min(2, count - index), attempt),
      ),
    );
  }
  for (let level = 0; ; level++) {
    const groups = await run(() =>
      actions.planReduction(jobId, level, attempt),
    );
    if (!groups) break;
    const rows = await run(() =>
      query(
        "SELECT batch_index FROM job_reductions WHERE job_id=$1 AND level=$2 AND completed",
        [jobId, level],
      ),
    );
    const completedGroups = new Set(rows.map((row) => Number(row.batch_index)));
    for (let index = 0; index < groups; index += 3) {
      if (
        Array.from(
          { length: Math.min(3, groups - index) },
          (_, offset) => index + offset,
        ).every((i) => completedGroups.has(i))
      )
        continue;
      await run(() =>
        rateLimited(() =>
          actions.reduce(
            jobId,
            level,
            index,
            Math.min(3, groups - index),
            attempt,
          ),
        ),
      );
    }
  }
  await run(() => rateLimited(() => actions.publish(jobId, attempt)));
}
export default asyncWorkloadFn(async (event) => {
  const [actions, { query }] = await Promise.all([
    import("../../lib/job-steps"),
    import("../../lib/db"),
  ]);
  return analysisWorkload(event, actions, query);
});
export const asyncWorkloadConfig = {
  events: ["evidence.analysis"],
  // SDK attempts include quota deferrals; application counters cap provider failures at three.
  maxRetries: 1000000,
};
