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
  resourceKey?: string;
};

export type SourceConnectionResult = {
  authorization?: string;
  items?: RemoteSource[];
  cursor?: string;
  picker?: { token: string; key: string; appId: string };
  source?: { id: string; filename: string; role: string; duplicate: boolean };
};
