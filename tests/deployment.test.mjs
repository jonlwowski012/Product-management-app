import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertDeploymentBranch,
  deploymentEnvironment,
} from "../scripts/netlify-build.mjs";

test("each app deploys only its intended branch in the primary context", () => {
  for (const [DEPLOY_ENV, BRANCH] of [
    ["production", "main"],
    ["preview", "stage"],
  ]) {
    assert.doesNotThrow(() =>
      assertDeploymentBranch({ DEPLOY_ENV, BRANCH, CONTEXT: "production" }),
    );
    for (const wrong of [
      { BRANCH: BRANCH === "main" ? "stage" : "main" },
      { BRANCH: "feature/experiment" },
      { CONTEXT: "deploy-preview" },
      { CONTEXT: "branch-deploy" },
      { DEPLOY_ENV: "" },
    ])
      assert.throws(
        () =>
          assertDeploymentBranch({
            DEPLOY_ENV,
            BRANCH,
            CONTEXT: "production",
            ...wrong,
          }),
        /Deploy production from main/,
      );
  }
});

test("builds derive the direct Neon connection without changing runtime configuration", () => {
  const env = {
    DEPLOY_ENV: "preview",
    BRANCH: "stage",
    CONTEXT: "production",
    DATABASE_URL:
      "postgresql://test:synthetic@ep-fixture-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require",
  };
  const result = deploymentEnvironment(env);
  assert.equal(
    new URL(result.DIRECT_DATABASE_URL).hostname,
    "ep-fixture.us-east-1.aws.neon.tech",
  );
  assert.equal(result.DATABASE_URL, env.DATABASE_URL);
  assert.equal(env.DIRECT_DATABASE_URL, undefined);
  assert.throws(
    () =>
      deploymentEnvironment({
        ...env,
        DATABASE_URL: "postgresql://localhost/test",
      }),
    /pooled Neon/,
  );
});

test("beta deployment preflight requires email delivery settings before migration", () => {
  const env = {
    ...process.env,
    DEPLOY_ENV: "preview",
    BETA_MODE: "true",
    RESEND_API_KEY: "",
    BETA_EMAIL_FROM: "",
  };
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
  ])
    env[name] = "not-used-by-preflight-regression-test";
  for (const name of ["RESEND_API_KEY", "BETA_EMAIL_FROM"]) {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/deploy-check.ts", "--before-migrate"],
      { env, encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      new RegExp("Missing beta deployment variable: " + name),
    );
    env[name] = "synthetic-setting";
  }
});
