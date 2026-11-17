import {
  getToken,
  startAuthorization,
  UserAuthorizationRequiredError,
  NoValidTokenError,
  type ConnectTokenParams,
} from "@vercel/connect";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { AppError, assertPersonalUser, assertWritableUser } from "@/lib/db";
import { apiResult, sameOrigin, smallJson } from "@/lib/http";
import { discoverySource, importedSourceDetails } from "@/lib/reports";
import { beginDirectSourceWrite } from "@/lib/source-write";
import { sourceProvider, type SourceProvider } from "@/lib/source-connections";
import { sourceConnector } from "@/lib/source-connector-config";
import {
  disconnectSource,
  rememberSourceGrant,
  sourceAuthorizationMs,
} from "@/lib/source-connection-grants";
import {
  downloadConfluence,
  downloadGoogleDrive,
  downloadGranola,
  downloadOneDrive,
  listGranola,
  listOneDrive,
  previewConfluence,
} from "@/lib/connected-source-providers";

export const runtime = "nodejs";
export const maxDuration = 60;

const scopes: Partial<Record<SourceProvider, string[]>> = {
  onedrive: ["Files.Read"],
  confluence: ["read:page:confluence"],
  "google-drive": ["https://www.googleapis.com/auth/drive.file"],
};

const idValue = z.string().min(1).max(2048);
const action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("browse"),
    folder: idValue.optional(),
    cursor: idValue.optional(),
  }),
  z.object({ action: z.literal("preview"), id: idValue }),
  z.object({
    action: z.literal("import"),
    id: idValue,
    title: z.string().min(1).max(300).optional(),
    transcript: z.boolean().optional(),
    resourceKey: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,256}$/)
      .optional(),
  }),
  z.object({ action: z.literal("disconnect") }),
]);

export async function POST(req: Request) {
  return apiResult(async () => {
    sameOrigin(req);
    const user = await requireUser();
    const body = await smallJson(req);
    const provider = sourceProvider.parse(body?.provider);
    const input = action.parse(body);
    const uid = sourceConnector(provider);
    if (!uid) throw new AppError("This source connection is unavailable.", 404);
    const subject = { type: "user" as const, id: user.id };
    const tokenParams: ConnectTokenParams = {
      subject,
      scopes: scopes[provider],
    };
    if (input.action === "disconnect") {
      await assertPersonalUser(user.id);
      await disconnectSource(user.id, uid);
      return { disconnected: true };
    }
    await assertWritableUser(user.id);
    const origin =
      input.action === "import" ? await beginDirectSourceWrite() : undefined;
    let token: string;
    try {
      // Recheck consent across server instances after a user disconnects.
      token = await getToken(uid, tokenParams, { forceRefresh: true });
    } catch (error) {
      if (!(
        error instanceof UserAuthorizationRequiredError ||
        error instanceof NoValidTokenError
      ))
        throw error;
      await rememberSourceGrant(user.id, uid);
      const callback = new URL("/?new=1", process.env.APP_URL);
      const authorization = await startAuthorization(uid, tokenParams, {
        callbackUrl: callback.href,
        expiresInMs: sourceAuthorizationMs,
      });
      return { authorization: authorization.url };
    }

    if (input.action === "browse") {
      if (provider === "onedrive")
        return listOneDrive(token, input.folder, input.cursor);
      if (provider === "granola") return listGranola(token);
      if (provider === "google-drive")
        return {
          picker: {
            token,
            key: process.env.GOOGLE_PICKER_API_KEY,
            appId: process.env.GOOGLE_PICKER_APP_ID,
          },
        };
      return {};
    }
    if (input.action === "preview") {
      if (provider !== "confluence")
        throw new AppError("Preview is unavailable for this provider.");
      return previewConfluence(token, input.id);
    }
    const item =
      provider === "onedrive"
        ? await downloadOneDrive(token, input.id)
        : provider === "google-drive"
          ? await downloadGoogleDrive(token, input.id, input.resourceKey)
          : provider === "confluence"
            ? await downloadConfluence(token, input.id)
            : await downloadGranola(
                token,
                input.id,
                input.title ?? "Granola meeting",
                input.transcript === true,
              );
    const source = await discoverySource(
      user.id,
      item.name,
      item.bytes,
      null,
      null,
      origin,
      {
        url: item.url,
        role: item.role,
      },
    );
    return {
      source: {
        ...source,
        ...(await importedSourceDetails(user.id, source.id)),
      },
    };
  });
}
