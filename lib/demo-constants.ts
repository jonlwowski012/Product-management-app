export const DEMO_VERSION = "simulation-demo-v2";
export const demoId = (n: number) =>
  `d3e00000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
export const DEMO_USER_ID = demoId(1);
export const DEMO_EMAIL = "public-demo@evidence.invalid";
