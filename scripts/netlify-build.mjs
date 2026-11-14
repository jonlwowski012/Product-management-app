import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export function assertDeploymentBranch(env) {
  const branch = { production: "main", preview: "stage" }[env.DEPLOY_ENV];
  if (!branch || env.BRANCH !== branch || env.CONTEXT !== "production")
    throw new Error(
      "Deploy production from main and staging from stage, using each app's primary deploy context.",
    );
}

export function deploymentEnvironment(env) {
  assertDeploymentBranch(env);
  let direct;
  try {
    direct = new URL(env.DATABASE_URL);
  } catch {
    throw new Error("Set a valid Neon DATABASE_URL before deployment.");
  }
  if (
    !direct.hostname.endsWith(".neon.tech") ||
    !direct.hostname.includes("-pooler.")
  )
    throw new Error("Deployment requires a pooled Neon DATABASE_URL.");
  direct.hostname = direct.hostname.replace("-pooler.", ".");
  return {
    ...env,
    DIRECT_DATABASE_URL: env.DIRECT_DATABASE_URL || direct.toString(),
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const env = deploymentEnvironment(process.env);
  for (const args of [
    ["run", "deploy:check", "--", "--before-migrate"],
    ["run", "db:migrate"],
    ["run", "demo:seed"],
    ["run", "deploy:check"],
    ["run", "build"],
  ]) {
    const result = spawnSync("npm", args, {
      env,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
