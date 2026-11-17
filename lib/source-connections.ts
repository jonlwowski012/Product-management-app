import { z } from "zod";

export const sourceProvider = z.enum([
  "onedrive",
  "confluence",
  "google-drive",
  "granola",
]);
export type SourceProvider = z.infer<typeof sourceProvider>;

export const sourceProviderNames: Record<SourceProvider, string> = {
  onedrive: "OneDrive",
  confluence: "Confluence",
  "google-drive": "Google Drive",
  granola: "Granola",
};

export type RemoteSource = {
  id: string;
  title: string;
  folder?: boolean;
  date?: string;
};

export type SourceConnectionResult = {
  authorization?: string;
  items?: RemoteSource[];
  cursor?: string;
  picker?: { token: string; key: string; appId: string };
  source?: { id: string; role: string; duplicate: boolean };
};

export function sourceConnector(provider: SourceProvider) {
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
