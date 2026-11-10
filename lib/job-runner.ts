export const hostedJobs = () =>
  ["workflow", "netlify"].includes(process.env.JOB_RUNNER || "") ||
  !!process.env.VERCEL;
