import { recoverJobs } from "./dispatch";
import { cleanStorage } from "./storage";
import { expireUploads } from "./uploads";
import { query } from "./db";
import { expireAccounts } from "./accounts";
export async function maintainWorkspace() {
  const accounts = await expireAccounts();
  const jobs = await recoverJobs();
  await expireUploads();
  const objects = await cleanStorage();
  await query("DELETE FROM sessions WHERE expires_at<now()");
  await query(
    "DELETE FROM groq_rate_limits WHERE updated_at<now()-interval '2 days'",
  );
  await query(
    "DELETE FROM auth_attempts WHERE created_at<now()-interval '1 day'",
  );
  return { jobs, objects, accounts, health: await workspaceHealth() };
}
export async function workspaceHealth() {
  const [health] = await query(`SELECT
      (SELECT count(*)::int FROM jobs WHERE state='processing' AND locked_at<now()-interval '30 minutes' AND available_at<=now()) AS "stuckJobs",
      (SELECT count(*)::int FROM jobs WHERE state='failed' AND finished_at>now()-interval '1 day') AS "recentFailedJobs",
      (SELECT count(*)::int FROM storage_deletions WHERE attempts>=3) AS "storageFailures",
      (SELECT count(*)::int FROM subscriptions WHERE paid_until IS NOT NULL AND subscription_id IS NOT NULL AND status IN ('past_due','unpaid')) AS "pastDueAccounts",
      (SELECT count(*)::int FROM users WHERE deletion_requested_at<now()-interval '1 day') AS "pendingDeletions"`);
  return health;
}
