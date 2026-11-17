import type { SourceProvider } from "./source-connections";

export function sourceConnector(provider: SourceProvider) {
  if (!(process.env.VERCEL === "1" || process.env.VERCEL_OIDC_TOKEN)) return;
  if (!process.env.APP_URL) return;
  return {
    onedrive: process.env.SOURCE_CONNECT_ONEDRIVE,
    confluence: process.env.SOURCE_CONNECT_CONFLUENCE,
    "google-drive":
      process.env.GOOGLE_PICKER_API_KEY && process.env.GOOGLE_PICKER_APP_ID
        ? process.env.SOURCE_CONNECT_GOOGLE_DRIVE
        : undefined,
    granola: process.env.SOURCE_CONNECT_GRANOLA,
  }[provider];
}
