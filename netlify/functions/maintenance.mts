import { AsyncWorkloadsClient } from "@netlify/async-workloads";
export default async () => {
  if (process.env.DEPLOY_ENV !== "production") return;
  const result = await new AsyncWorkloadsClient({
    baseUrl: process.env.APP_URL,
  }).send("evidence.maintenance");
  if (result.sendStatus !== "succeeded")
    throw new Error("Scheduled maintenance dispatch failed");
};
export const config = { schedule: "0 8 * * *" };
