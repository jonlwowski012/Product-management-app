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
