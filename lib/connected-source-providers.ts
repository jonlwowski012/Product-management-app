import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { AppError } from "./db";
import { discoveryExtensions } from "./documents";
import { MAX_UPLOAD } from "./ingest";
import type { RemoteSource } from "./source-connections";

const graph = "https://graph.microsoft.com/v1.0/me/drive";
const drive = "https://www.googleapis.com/drive/v3/files";
const atlassian = "https://api.atlassian.com";
const granola = "https://mcp.granola.ai/mcp";
const idSchema = z
  .string()
  .regex(/^[A-Za-z0-9_!.-]{1,256}$/)
  .refine((id) => id !== "." && id !== "..");

function checkedUrl(input: string, host: RegExp) {
  const url = URL.parse(input);
  return url?.protocol === "https:" &&
    !url.port &&
    !url.username &&
    !url.password &&
    host.test(url.hostname)
    ? url
    : null;
}

function requireId(id: string) {
  const result = idSchema.safeParse(id);
  if (!result.success) throw new AppError("Invalid source ID");
  return encodeURIComponent(result.data);
}

function providerStatus(response: Response) {
  if (response.ok) return;
  if (response.status === 429)
    throw new AppError("The provider is busy. Try again shortly.", 429);
  if ([401, 403, 404].includes(response.status))
    throw new AppError(
      "This connection cannot read the item. Check access or reconnect.",
      403,
    );
  throw new AppError(
    "The source provider is unavailable. Try again shortly.",
    502,
  );
}

async function providerFetch(
  url: string | URL,
  token?: string,
  redirect: RequestRedirect = "error",
) {
  try {
    return await fetch(url, {
      headers: token ? { Authorization: "Bearer " + token } : undefined,
      redirect,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new AppError(
      "The source provider is unavailable. Try again shortly.",
      502,
    );
  }
}

async function bodyBytes(response: Response, max = MAX_UPLOAD) {
  providerStatus(response);
  if (Number(response.headers.get("content-length")) > max) {
    await response.body?.cancel();
    throw new AppError(
      "The provider response exceeds the import size limit.",
      413,
    );
  }
  const reader = response.body?.getReader();
  if (!reader)
    throw new AppError("The provider returned an empty document.", 422);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new AppError(
        "The provider response exceeds the import size limit.",
        413,
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function providerJson<T>(
  url: string | URL,
  token: string,
  schema: z.ZodType<T>,
) {
  const raw = await bodyBytes(await providerFetch(url, token), 2 * 1024 * 1024);
  try {
    return schema.parse(JSON.parse(raw.toString("utf8")));
  } catch {
    throw new AppError(
      "The source provider returned an unexpected response.",
      502,
    );
  }
}

function filename(title: string, extension = "") {
  return (
    title
      .replace(/[\\/\x00-\x1f\x7f]/g, " ")
      .trim()
      .slice(0, 190) + extension
  );
}

type Download = {
  name: string;
  bytes: Buffer;
  url?: string;
  role: "auto" | "context";
};

const microsoftHost =
  /(^|\.)(sharepoint\.com|onedrive\.com|1drv\.com|live\.com)$/i;
const graphItem = z.object({
  id: idSchema,
  name: z.string(),
  size: z.number().optional(),
  webUrl: z.string().optional(),
  folder: z.object({}).optional(),
  file: z.object({}).optional(),
});

export async function listOneDrive(
  token: string,
  folder?: string,
  cursor?: string,
) {
  const base = folder ? `items/${requireId(folder)}` : "root";
  const url = new URL(`${graph}/${base}/children`);
  url.searchParams.set("$select", "id,name,folder,file,size");
  url.searchParams.set("$top", "50");
  if (cursor) url.searchParams.set("$skiptoken", cursor);
  const data = await providerJson(
    url,
    token,
    z.object({
      value: z.array(graphItem),
      "@odata.nextLink": z.string().optional(),
    }),
  );
  return {
    items: data.value.flatMap((item) =>
      item.folder || (item.file && discoveryExtensions.test(item.name))
        ? [{ id: item.id, title: item.name, folder: !!item.folder }]
        : [],
    ),
    cursor:
      URL.parse(data["@odata.nextLink"] ?? "")?.searchParams.get(
        "$skiptoken",
      ) ?? undefined,
  };
}

export async function downloadOneDrive(
  token: string,
  id: string,
): Promise<Download> {
  const url = `${graph}/items/${requireId(id)}`;
  const item = await providerJson(url, token, graphItem);
  if (!item.file || !discoveryExtensions.test(item.name))
    throw new AppError("Choose a supported OneDrive file.");
  if ((item.size ?? 0) > MAX_UPLOAD)
    throw new AppError("Each file must be at most 10 MB.", 413);
  let response = await providerFetch(url + "/content", token, "manual");
  if (response.status === 302) {
    const location = checkedUrl(
      response.headers.get("location") ?? "",
      microsoftHost,
    );
    if (!location)
      throw new AppError(
        "OneDrive returned an unexpected download address.",
        502,
      );
    response = await providerFetch(location);
  }
  return {
    // Preserve the extension when the provider's title is longer than Evidence's filenames.
    name: filename(
      item.name.replace(discoveryExtensions, ""),
      item.name.match(discoveryExtensions)![0],
    ),
    url: checkedUrl(item.webUrl ?? "", microsoftHost)?.href,
    bytes: await bodyBytes(response),
    role: "auto",
  };
}

const googleDoc = "application/vnd.google-apps.document";
export async function downloadGoogleDrive(
  token: string,
  id: string,
): Promise<Download> {
  const url = `${drive}/${requireId(id)}`;
  const item = await providerJson(
    url + "?fields=name,mimeType,size,webViewLink,trashed",
    token,
    z.object({
      name: z.string(),
      mimeType: z.string(),
      size: z.coerce.number().optional(),
      webViewLink: z.string().optional(),
      trashed: z.boolean().optional(),
    }),
  );
  const doc = item.mimeType === googleDoc;
  const ext = item.name.match(discoveryExtensions)?.[0];
  if (
    item.trashed ||
    (!doc && (!ext || item.mimeType.startsWith("application/vnd.google-apps.")))
  )
    throw new AppError("Choose a Google Doc or a supported file.");
  if ((item.size ?? 0) > MAX_UPLOAD)
    throw new AppError("Each file must be at most 10 MB.", 413);
  const endpoint = doc ? "/export?mimeType=text%2Fplain" : "?alt=media";
  return {
    name: doc
      ? filename(item.name, ".txt")
      : filename(item.name.replace(discoveryExtensions, ""), ext),
    url: checkedUrl(item.webViewLink ?? "", /^(docs|drive)\.google\.com$/)
      ?.href,
    bytes: await bodyBytes(await providerFetch(url + endpoint, token)),
    role: "auto",
  };
}

export function confluenceAddress(link: string) {
  const url = checkedUrl(link, /^[a-z0-9-]+\.atlassian\.net$/i);
  const id =
    url?.pathname.match(/^\/wiki\/spaces\/[^/]+\/pages\/(\d+)(?:\/|$)/)?.[1] ??
    (url?.pathname === "/wiki/pages/viewpage.action"
      ? url.searchParams.get("pageId")
      : null);
  if (!url || !id || !/^\d{1,30}$/.test(id))
    throw new AppError("Paste a Confluence Cloud page link with its page ID.");
  return { site: url.origin, id };
}

async function confluencePage(token: string, link: string, body: boolean) {
  const { site, id } = confluenceAddress(link);
  const sites = await providerJson(
    atlassian + "/oauth/token/accessible-resources",
    token,
    z.array(z.object({ id: z.uuid(), url: z.string() })),
  );
  const cloud = sites.find((entry) => URL.parse(entry.url)?.origin === site);
  if (!cloud)
    throw new AppError(
      "Authorize this Confluence site before importing the page.",
      403,
    );
  const page = await providerJson(
    `${atlassian}/ex/confluence/${cloud.id}/wiki/api/v2/pages/${id}${body ? "?body-format=atlas_doc_format" : ""}`,
    token,
    z.object({
      title: z.string(),
      body: z
        .object({
          atlas_doc_format: z.object({ value: z.string() }).optional(),
        })
        .optional(),
    }),
  );
  return { ...page, url: `${site}/wiki/pages/viewpage.action?pageId=${id}` };
}

export async function previewConfluence(token: string, link: string) {
  const page = await confluencePage(token, link, false);
  return { items: [{ id: link, title: page.title }] };
}

export function confluenceText(adf: unknown): string {
  const text: string[] = [];
  const visit = (value: unknown, level: number) => {
    if (level > 80 || !value || typeof value !== "object") return;
    const node = value as {
      type?: string;
      text?: unknown;
      content?: unknown[];
    };
    if (node.type === "text" && typeof node.text === "string")
      text.push(node.text);
    if (Array.isArray(node.content))
      node.content.forEach((child) => visit(child, level + 1));
    if (
      ["paragraph", "heading", "hardBreak", "codeBlock", "tableRow"].includes(
        node.type ?? "",
      )
    )
      text.push("\n");
  };
  visit(adf, 0);
  return text.join("").trim();
}

export async function downloadConfluence(
  token: string,
  link: string,
): Promise<Download> {
  const page = await confluencePage(token, link, true);
  let text = "";
  try {
    text = confluenceText(
      JSON.parse(page.body?.atlas_doc_format?.value ?? "null"),
    );
  } catch {
    throw new AppError("Confluence returned an unreadable page.", 502);
  }
  return {
    name: filename(page.title, ".txt"),
    bytes: Buffer.from(text),
    url: page.url,
    role: "context",
  };
}

type MeetingTool = "list_meetings" | "get_meetings" | "get_meeting_transcript";
async function meetingCall(
  token: string,
  name: MeetingTool,
  args: Record<string, unknown>,
) {
  const client = new Client({ name: "Evidence", version: "1" });
  const signal = AbortSignal.timeout(36_000);
  const transport = new StreamableHTTPClientTransport(new URL(granola), {
    requestInit: {
      headers: { Authorization: "Bearer " + token },
      redirect: "error",
    },
    fetch: async (input, init) => {
      const response = await fetch(input, {
        ...init,
        signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal,
      });
      if (!response.body) return response;
      let size = 0;
      const stream = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            size += chunk.byteLength;
            // Allow for JSON string escapes around a document of up to 10 MB.
            if (size > MAX_UPLOAD * 2)
              controller.error(
                new AppError("This Granola document exceeds 10 MB.", 413),
              );
            else controller.enqueue(chunk);
          },
        }),
      );
      return new Response(stream, {
        status: response.status,
        headers: response.headers,
      });
    },
  });
  try {
    await client.connect(transport, { timeout: 12_000 });
    const result = await client.callTool({ name, arguments: args }, undefined, {
      timeout: 20_000,
    });
    const blocks = z
      .array(z.object({ type: z.literal("text"), text: z.string() }))
      .safeParse(result.content);
    const text = blocks.success
      ? blocks.data.map((block) => block.text).join("\n")
      : "";
    if (result.isError) {
      if (
        name === "get_meeting_transcript" &&
        /paid|plan|transcript.{0,30}(?:disabled|available|access)/i.test(text)
      )
        throw new AppError(
          "Granola transcript access requires an eligible paid plan and workspace permission.",
          403,
        );
      throw new AppError(
        "Granola could not read this meeting. Check access and try again.",
        403,
      );
    }
    if (Buffer.byteLength(text) > MAX_UPLOAD)
      throw new AppError("This Granola document exceeds 10 MB.", 413);
    return { text, structured: result.structuredContent };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "Granola is unavailable or the connection needs to be renewed.",
      502,
    );
  } finally {
    await client.close().catch(() => {});
  }
}

const meetingId = z.uuid();
const meeting = z.object({
  id: meetingId,
  title: z.string(),
  date: z.string().optional(),
});
export function granolaItems(
  text: string,
  structured?: unknown,
): RemoteSource[] {
  const fields = z.object({ meetings: z.array(meeting) }).safeParse(structured);
  if (fields.success) return fields.data.meetings;
  if (!/<meetings_data(?:\s|>)/.test(text)) {
    if (/^(no (meetings|notes)|\[\])/i.test(text.trim())) return [];
    throw new AppError("Granola returned an unexpected meeting list.", 502);
  }
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: false,
  });
  // The bodies can contain inline email addresses and Markdown. Read only the meeting tags.
  const items = Array.from(text.matchAll(/<meeting\s+([^>]+)>/g)).flatMap(
    ([, attributes]) => {
      const item = meeting.safeParse(
        parser.parse(`<meeting ${attributes}/>`).meeting,
      );
      return item.success ? [item.data] : [];
    },
  );
  if (!items.length && /<meeting\s/.test(text))
    throw new AppError("Granola returned unexpected meeting metadata.", 502);
  return items;
}

export async function listGranola(token: string) {
  const data = await meetingCall(token, "list_meetings", {
    time_range: "last_30_days",
  });
  return { items: granolaItems(data.text, data.structured) };
}

export async function downloadGranola(
  token: string,
  id: string,
  title: string,
  transcript: boolean,
): Promise<Download> {
  if (!meetingId.safeParse(id).success)
    throw new AppError("Invalid meeting ID");
  const data = transcript
    ? await meetingCall(token, "get_meeting_transcript", { meeting_id: id })
    : await meetingCall(token, "get_meetings", { meeting_ids: [id] });
  const content = transcript
    ? data.text
        .replace(/^\s*<transcript\b[^>]*>\s*|\s*<\/transcript>\s*$/g, "")
        .trim()
    : [
        ...data.text.matchAll(
          /<(summary|private_notes|notes)>([\s\S]*?)<\/\1>/g,
        ),
      ]
        .map(([, , content]) => content.trim())
        .filter(Boolean)
        .join("\n\n");
  if (!content)
    throw new AppError(
      "Granola returned no readable content for this meeting.",
      422,
    );
  return {
    name: filename(
      title,
      transcript ? " (transcript).txt" : " (Granola notes).txt",
    ),
    url: `https://notes.granola.ai/d/${id}`,
    bytes: Buffer.from(content),
    role: transcript ? "auto" : "context",
  };
}
