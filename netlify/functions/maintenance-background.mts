import { asyncWorkloadFn } from "@netlify/async-workloads";
import { maintainWorkspace } from "../../lib/maintenance";
export default asyncWorkloadFn(async () => {
  try {
    await maintainWorkspace();
  } catch {
    throw new Error("Scheduled maintenance temporarily unavailable");
  }
});
export const asyncWorkloadConfig = {
  events: ["evidence.maintenance"],
  maxRetries: 2,
};
