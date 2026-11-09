import { sleep } from "workflow";
import {
  prepare,
  extract,
  publish,
  failed,
  planReduction,
  reduce,
} from "./steps";
// Only IDs and counts enter the durable event log. Source text and BYOK secrets
// are loaded inside steps and never returned to the workflow runtime.
export async function discoveryWorkflow(jobId: string, attempt: string) {
  "use workflow";
  try {
    const count = await prepare(jobId, attempt);
    // Bundle calls to bound event-log growth; every item still checkpoints independently.
    for (let index = 0; index < count; index += 2) {
      let wait;
      while (
        (wait = await extract(
          jobId,
          index,
          Math.min(2, count - index),
          attempt,
        ))
      )
        await sleep(`${wait}s`);
    }
    for (let level = 0; ; level++) {
      const groups = await planReduction(jobId, level, attempt);
      if (!groups) break;
      for (let index = 0; index < groups; index += 3) {
        let wait;
        while (
          (wait = await reduce(
            jobId,
            level,
            index,
            Math.min(3, groups - index),
            attempt,
          ))
        )
          await sleep(`${wait}s`);
      }
    }
    let wait;
    while ((wait = await publish(jobId, attempt))) await sleep(`${wait}s`);
  } catch {
    await failed(jobId, attempt);
  }
}
