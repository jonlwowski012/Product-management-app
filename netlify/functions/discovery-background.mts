import {
  asyncWorkloadFn,
  ErrorDoNotRetry,
  ErrorRetryAfterDelay,
  type AsyncWorkloadEvent,
} from "@netlify/async-workloads";
import { FatalError, RetryableError } from "workflow";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import * as jobActions from "../../lib/job-steps";
import { query as database } from "../../lib/db";
const eventSchema = z.object({ jobId: z.uuid(), attempt: z.uuid() });
// Only IDs, counts and successful checkpoints enter the durable event log.
export async function analysisWorkload(
  event: AsyncWorkloadEvent,
  actions: typeof jobActions,
  query: typeof database,
) {
  const parsed = eventSchema.safeParse(event.eventData);
  if (!parsed.success) throw new ErrorDoNotRetry("Invalid analysis event");
  const { jobId, attempt } = parsed.data,
    { step } = event;
  let fresh = false;
  const run = async <T,>(fn: () => Promise<T>): Promise<T> => {
    for (let retry = 0; ; retry++) {
      try {
        const [active] = await query(
          "UPDATE jobs SET locked_at=now() WHERE id=$1 AND dispatch_token=$2 AND state IN ('queued','processing') RETURNING id,greatest(0,ceil(extract(epoch from (available_at-now()))*1000))::bigint AS wait_ms",
          [jobId, attempt],
        );
        if (!active)
          throw new ErrorDoNotRetry("Analysis attempt is no longer active");
        if (Number(active.wait_ms) > 0)
          throw new ErrorRetryAfterDelay({
            message: "AI quota wait",
            retryDelay: Number(active.wait_ms),
            forceDelayTime: true,
          });
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
        ) {
          const wait = Math.max(1000, error.retryAfter.getTime() - Date.now());
          await run(() =>
            query(
              "UPDATE jobs SET available_at=now()+($3::bigint * interval '1 millisecond') WHERE id=$1 AND dispatch_token=$2",
              [jobId, attempt, wait],
            ),
          );
          throw new ErrorRetryAfterDelay({
            message: "AI provider temporarily unavailable",
            retryDelay: wait,
            forceDelayTime: true,
          });
        }
        if (!(error instanceof FatalError) && retry < 2) {
          await delay(2000);
          continue;
        }
        await actions.failed(jobId, attempt).catch(() => {});
        throw new ErrorDoNotRetry("Analysis stopped; see its saved status");
      }
    }
  };
  const checkpoint = <T,>(key: string, fn: () => Promise<T>) =>
    step.run(key, () => {
      fresh = true;
      return run(fn);
    });
  const rateLimited = async (fn: () => Promise<number | void>) => {
    const wait = await fn();
    if (wait) {
      await query(
        "UPDATE jobs SET available_at=now()+($3::int * interval '1 second') WHERE id=$1 AND dispatch_token=$2",
        [jobId, attempt, wait],
      );
      // Defer the unfinished step, so quota waits do not grow the checkpoint payload.
      throw new ErrorRetryAfterDelay({
        message: "AI quota wait",
        retryDelay: wait * 1000,
        forceDelayTime: true,
      });
    }
    return 0;
  };
  const count = await checkpoint("prepare", () =>
    actions.prepare(jobId, attempt),
  );
  // The SDK does not yield background functions after persisting a step.
  if (fresh) return;
  for (let index = 0; index < count; index += 2) {
    await checkpoint(`extract-${index}`, () =>
      rateLimited(() =>
        actions.extract(jobId, index, Math.min(2, count - index), attempt),
      ),
    );
    if (fresh) return;
  }
  for (let level = 0; ; level++) {
    const groups = await checkpoint(`plan-${level}`, () =>
      actions.planReduction(jobId, level, attempt),
    );
    if (fresh) return;
    if (!groups) break;
    for (let index = 0; index < groups; index += 3) {
      await checkpoint(`reduce-${level}-${index}`, () =>
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
      if (fresh) return;
    }
  }
  await checkpoint("publish", () =>
    rateLimited(() => actions.publish(jobId, attempt)),
  );
}
export default asyncWorkloadFn((event) =>
  analysisWorkload(event, jobActions, database),
);
export const asyncWorkloadConfig = {
  events: ["evidence.analysis"],
  // SDK attempts include quota deferrals; application counters still cap provider failures at three.
  maxRetries: 1000000,
};
