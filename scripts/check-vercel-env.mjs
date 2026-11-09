import { readFile } from "node:fs/promises";
import { parse } from "dotenv";
const target = process.env.DEPLOY_ENV;
if (!["preview", "production"].includes(target))
  throw new Error("Invalid deployment environment");
const remote = parse(await readFile(`.vercel/.env.${target}.local`));
for (const name of [
  "DATABASE_URL",
  "APP_SECRET",
  "APP_URL",
  "SUPPORT_EMAIL",
  "LEGAL_OPERATOR_NAME",
  "CRON_SECRET",
  "BLOB_READ_WRITE_TOKEN",
  "COOKIE_SECURE",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_ID",
  "STRIPE_PORTAL_CONFIGURATION_ID",
  "STRIPE_WEBHOOK_SECRET",
]) {
  if (remote[name] !== process.env[name])
    throw new Error(
      "Vercel runtime setting differs from validated CI setting: " + name,
    );
}
for (const name of [
  "DIRECT_DATABASE_URL",
  "E2E_TEST_MODE",
  "E2E_PROVIDER_BASE_URL",
  "VERCEL_BLOB_API_URL",
  "NEXT_PUBLIC_VERCEL_BLOB_API_URL",
  "WORKFLOW_TARGET_WORLD",
  "WORKFLOW_LOCAL_BASE_URL",
])
  if (remote[name])
    throw new Error(
      "Remove privileged/local setting from Vercel runtime: " + name,
    );
console.log(
  "Vercel runtime environment matches validated deployment configuration.",
);
