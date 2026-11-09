import { timingSafeEqual } from "node:crypto";
import { recoverJobs } from "@/lib/dispatch";
import { cleanStorage } from "@/lib/storage";
import { expireUploads } from "@/lib/uploads";
import { apiResult } from "@/lib/http";
import { AppError, query } from "@/lib/db";
import { expireAccounts } from "@/lib/accounts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(req: Request) {
  return apiResult(async () => {
    const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`,
      actual = req.headers.get("authorization") ?? "";
    if (
      !process.env.CRON_SECRET ||
      actual.length !== expected.length ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
    )
      throw new AppError("Unauthorized", 401);
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
    const [health] = await query(`SELECT
      (SELECT count(*)::int FROM jobs WHERE state='processing' AND locked_at<now()-interval '30 minutes') AS "stuckJobs",
      (SELECT count(*)::int FROM jobs WHERE state='failed' AND finished_at>now()-interval '1 day') AS "recentFailedJobs",
      (SELECT count(*)::int FROM storage_deletions WHERE attempts>=3) AS "storageFailures",
      (SELECT count(*)::int FROM subscriptions WHERE paid_until IS NOT NULL AND subscription_id IS NOT NULL AND status IN ('past_due','unpaid')) AS "pastDueAccounts",
      (SELECT count(*)::int FROM users WHERE deletion_requested_at<now()-interval '1 day') AS "pendingDeletions"`);
    return { jobs, objects, accounts, health };
  });
}
