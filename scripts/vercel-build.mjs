import { spawnSync } from "node:child_process";

const { VERCEL_ENV, VERCEL_GIT_COMMIT_REF } = process.env;
const branch = { production: "main", preview: "stage" }[VERCEL_ENV];
if (!branch || VERCEL_GIT_COMMIT_REF !== branch)
  throw new Error("Vercel deploys main to production and stage to preview.");

const direct = new URL(process.env.DATABASE_URL);
direct.hostname = direct.hostname.replace("-pooler.", ".");
const env = {
  ...process.env,
  DEPLOY_ENV: VERCEL_ENV,
  JOB_RUNNER: "workflow",
  DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL || direct.toString(),
};
for (const args of [
  ["run", "deploy:check", "--", "--before-migrate"],
  ["run", "db:migrate"],
  ["run", "demo:seed"],
  ["run", "deploy:check"],
  ["run", "build"],
]) {
  const result = spawnSync("npm", args, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
