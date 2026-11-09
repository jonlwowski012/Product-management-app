import "dotenv/config";
import { runOne } from "../lib/jobs";
import { pool } from "../lib/db";
let running = true;
process.on("SIGTERM", () => {
  running = false;
});
process.on("SIGINT", () => {
  running = false;
});
console.log("Discovery worker ready");
while (running) {
  try {
    const worked = await runOne();
    if (!worked) await new Promise((r) => setTimeout(r, 750));
  } catch {
    console.error("Worker database unavailable; retrying");
    await new Promise((r) => setTimeout(r, 3000));
  }
}
await pool.end();
