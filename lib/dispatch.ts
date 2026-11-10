import { start, getRun } from "workflow/api";
import { discoveryWorkflow } from "./workflows/discovery";
import { query, id } from "./db";
export async function dispatchJob(jid: string) {
  const token = id();
  const [job] = await query(
    "UPDATE jobs SET dispatch_token=$1,dispatch_after=now()+interval '5 minutes' WHERE id=$2 AND user_id IN (SELECT id FROM users WHERE NOT is_demo) AND state IN ('queued','processing') AND workflow_run_id IS NULL AND dispatch_after<=now() RETURNING id",
    [token, jid],
  );
  if (!job) return;
  try {
    let run: { runId: string };
    if (process.env.JOB_RUNNER === "netlify") {
      const { AsyncWorkloadsClient } = await import("@netlify/async-workloads");
      const sent = await new AsyncWorkloadsClient({
        baseUrl: process.env.APP_URL,
      }).send("evidence.analysis", { data: { jobId: jid, attempt: token } });
      if (sent.sendStatus !== "succeeded")
        throw new Error("Analysis dispatch unavailable");
      run = { runId: "netlify:" + sent.eventId };
    } else
      run =
        process.env.VERCEL === "1"
          ? await start(discoveryWorkflow, [jid, token], {
              deploymentId: "latest",
            })
          : await start(discoveryWorkflow, [jid, token]);
    if (process.env.VERCEL === "1")
      console.info("Workflow dispatched", {
        runId: run.runId,
        callerDeployment: process.env.VERCEL_DEPLOYMENT_ID,
        target: "latest",
      });
    await query(
      "UPDATE jobs SET workflow_run_id=$1 WHERE id=$2 AND dispatch_token=$3",
      [run.runId, jid, token],
    );
  } catch {
    await query(
      "UPDATE jobs SET dispatch_after=now()+interval '1 minute',dispatch_token=NULL WHERE id=$1 AND dispatch_token=$2",
      [jid, token],
    );
  }
}
export async function recoverJobs(user?: string) {
  const jobs = await query(
    `SELECT id,workflow_run_id FROM jobs WHERE user_id IN (SELECT id FROM users WHERE NOT is_demo) AND state IN ('queued','processing') AND dispatch_after<=now() AND (workflow_run_id IS NULL OR workflow_run_id NOT LIKE 'netlify:%' OR greatest(coalesce(locked_at,created_at),available_at)<now()-interval '30 minutes')${user ? " AND user_id=$1" : ""} ORDER BY created_at LIMIT 20`,
    user ? [user] : [],
  );
  for (const job of jobs) {
    if (job.workflow_run_id) {
      if (job.workflow_run_id.startsWith("netlify:")) {
        // A dead-lettered/timed-out event must leave a retryable job; provider quota waits keep their own deadline.
        await query(
          "UPDATE jobs SET state='failed',error='Workflow interrupted; retry available',locked_at=NULL,finished_at=now() WHERE id=$1 AND workflow_run_id=$2 AND state IN ('queued','processing') AND greatest(coalesce(locked_at,created_at),available_at)<now()-interval '30 minutes'",
          [job.id, job.workflow_run_id],
        );
        continue;
      }
      try {
        const status = await getRun(job.workflow_run_id).status;
        if (
          status === "failed" ||
          status === "cancelled" ||
          status === "completed"
        ) {
          await query(
            "UPDATE jobs SET state='failed',error='Workflow interrupted; retry available',locked_at=NULL,finished_at=now() WHERE id=$1 AND workflow_run_id=$2 AND state IN ('queued','processing')",
            [job.id, job.workflow_run_id],
          );
        } else
          await query(
            "UPDATE jobs SET dispatch_after=now()+interval '5 minutes' WHERE id=$1 AND workflow_run_id=$2 AND state IN ('queued','processing')",
            [job.id, job.workflow_run_id],
          );
      } catch {
        /* A temporary SDK outage must not change an active job. */
      }
    } else await dispatchJob(job.id);
  }
  return jobs.length;
}
