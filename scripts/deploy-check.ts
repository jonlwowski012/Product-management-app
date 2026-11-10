import "dotenv/config";
import pg from "pg";
const target = process.env.DEPLOY_ENV;
if (!["preview", "production"].includes(target ?? ""))
  throw new Error("Set DEPLOY_ENV to preview or production");
for (const name of [
  "DATABASE_URL",
  "DIRECT_DATABASE_URL",
  "APP_SECRET",
  "APP_URL",
  "CRON_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_ID",
  "STRIPE_PORTAL_CONFIGURATION_ID",
  "STRIPE_WEBHOOK_SECRET",
]) {
  if (!process.env[name])
    throw new Error("Missing deployment variable: " + name);
}
if (
  target === "production" &&
  (!process.env.SUPPORT_EMAIL || !process.env.LEGAL_OPERATOR_NAME)
)
  throw new Error(
    "Production requires real SUPPORT_EMAIL and LEGAL_OPERATOR_NAME business details",
  );
if (process.env.APP_SECRET!.length < 32 || process.env.CRON_SECRET!.length < 32)
  throw new Error("Use independent random secrets of at least 32 characters");
if (
  !process.env.APP_URL!.startsWith("https://") ||
  process.env.COOKIE_SECURE !== "true"
)
  throw new Error("Deployment requires HTTPS and secure cookies");
for (const name of [
  "E2E_TEST_MODE",
  "E2E_PROVIDER_BASE_URL",
  "VERCEL_BLOB_API_URL",
  "NEXT_PUBLIC_VERCEL_BLOB_API_URL",
  "WORKFLOW_LOCAL_BASE_URL",
  "WORKFLOW_TARGET_WORLD",
])
  if (process.env[name])
    throw new Error("Remove local/test setting before deployment: " + name);
if (process.env.STORAGE_PROVIDER === "netlify") {
  if (process.env.JOB_RUNNER !== "netlify" || !process.env.AWL_API_KEY)
    throw new Error("Netlify requires its durable job runner and AWL_API_KEY");
} else if (
  !process.env.BLOB_READ_WRITE_TOKEN ||
  (process.env.JOB_RUNNER && process.env.JOB_RUNNER !== "workflow")
)
  throw new Error("Vercel requires private Blob storage and Workflows");
const runtime = new URL(process.env.DATABASE_URL!),
  direct = new URL(process.env.DIRECT_DATABASE_URL!);
if (
  !runtime.hostname.endsWith(".neon.tech") ||
  !runtime.hostname.includes("-pooler.") ||
  direct.hostname.includes("-pooler.")
)
  throw new Error(
    "Use Neon pooled DATABASE_URL and direct DIRECT_DATABASE_URL",
  );
if (
  runtime.hostname.replace("-pooler.", ".") !== direct.hostname ||
  runtime.pathname !== direct.pathname
)
  throw new Error("Runtime and migration URLs must target the same database");
if (
  !["require", "verify-full"].includes(
    runtime.searchParams.get("sslmode") ?? "",
  ) ||
  !["require", "verify-full"].includes(direct.searchParams.get("sslmode") ?? "")
)
  throw new Error("Neon connections require TLS");
const db = new pg.Client({ connectionString: process.env.DIRECT_DATABASE_URL });
await db.connect();
try {
  const { rows } = await db.query(
    "SELECT to_regclass('public.deployment_environment') AS bound",
  );
  if (process.argv.includes("--before-migrate")) {
    if (rows[0].bound) {
      const {
        rows: [binding],
      } = await db.query(
        "SELECT name FROM deployment_environment WHERE singleton=true",
      );
      if (binding && binding.name !== target)
        throw new Error("Database is bound to another environment");
    }
    console.log("Pre-migration deployment configuration validated for", target);
  } else {
    if (!rows[0].bound)
      throw new Error("Run versioned migrations before deployment validation");
    await db.query(
      "INSERT INTO deployment_environment(singleton,name) VALUES(true,$1) ON CONFLICT DO NOTHING",
      [target],
    );
    const {
      rows: [binding],
    } = await db.query(
      "SELECT name FROM deployment_environment WHERE singleton=true",
    );
    if (binding.name !== target)
      throw new Error(
        "This database is already bound to another deployment environment",
      );
    console.log("Deployment configuration validated for", target);
  }
} finally {
  await db.end();
}
