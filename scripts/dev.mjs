import "dotenv/config";
import { spawn } from "node:child_process";
process.env.WATCHPACK_POLLING ??= "true";
const children = [
  spawn(
    "node",
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      process.env.PORT || "3000",
    ],
    { stdio: "inherit" },
  ),
  spawn("node", ["--import", "tsx", "scripts/worker.ts"], { stdio: "inherit" }),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  children.forEach((c) => c.kill("SIGTERM"));
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children.forEach((c) =>
  c.on("exit", (code) => {
    stop();
    process.exitCode = code ?? 0;
  }),
);
