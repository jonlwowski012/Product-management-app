import { asyncWorkloadFn } from "@netlify/async-workloads";
export default asyncWorkloadFn(async () => {
  try {
    const { maintainWorkspace } = await import("../../lib/maintenance");
    await maintainWorkspace();
  } catch {
    throw new Error("Scheduled maintenance temporarily unavailable");
  }
});
export const asyncWorkloadConfig = {
  events: ["evidence.maintenance"],
  maxRetries: 2,
};
