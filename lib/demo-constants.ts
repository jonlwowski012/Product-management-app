export const DEMO_VERSION = "sales-demo-v1";
export const demoId = (n: number) =>
  `d3e00000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
export const DEMO_USER_ID = demoId(1);
export const DEMO_EMAIL = "public-demo@evidence.invalid";
export const demoStory = {
  executive: "/executive",
  brief: "/briefs/" + demoId(500),
  feature: "/features/" + demoId(400),
  source: "/transcripts/" + demoId(200) + "?signal=" + demoId(300),
  discovery: "/discovery",
};
