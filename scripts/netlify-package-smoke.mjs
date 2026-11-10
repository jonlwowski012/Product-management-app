import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
for (const name of [
  "discovery-background",
  "maintenance-background",
  "async-workloads-router",
  "async-workloads-scheduler",
]) {
  const zip = path.resolve(".netlify/functions", name + ".zip"),
    root = await mkdtemp(path.join(tmpdir(), "evidence-native-module-"));
  try {
    const entries = execFileSync("unzip", ["-Z1", zip], {
      encoding: "utf8",
    }).split("\n");
    const entry = entries.find((file) => file.endsWith("/" + name + ".mjs"));
    assert.ok(entry, "Missing packaged function module: " + name);
    execFileSync("unzip", ["-q", zip, "-d", root]);
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `globalThis.Netlify={context:'production',env:{get:()=>undefined}};await import(${JSON.stringify(path.join(root, entry))});`,
      ],
      { cwd: root, env: { PATH: process.env.PATH }, stdio: "pipe" },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
console.log(
  "Packaged native workers and queue entry points import without request-only Next.js dependencies.",
);
