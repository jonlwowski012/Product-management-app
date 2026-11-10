import "dotenv/config";
if (!process.env.APP_URL || !process.env.CRON_SECRET)
  throw new Error("Set APP_URL and CRON_SECRET");
const response = await fetch(
  new URL("/api/maintenance?health=1", process.env.APP_URL),
  {
    headers: { authorization: "Bearer " + process.env.CRON_SECRET },
    signal: AbortSignal.timeout(240000),
  },
);
if (!response.ok)
  throw new Error("Maintenance/health request failed: HTTP " + response.status);
const { health } = await response.json();
const checks = [
  "stuckJobs",
  "storageFailures",
  "recentFailedJobs",
  "pastDueAccounts",
  "pendingDeletions",
];
if (
  !health ||
  !checks.every(
    (name) => Number.isSafeInteger(health[name]) && health[name] === 0,
  )
)
  throw new Error(
    "Operations attention required: " + JSON.stringify(health || {}),
  );
console.log("Maintenance and health checks passed");
