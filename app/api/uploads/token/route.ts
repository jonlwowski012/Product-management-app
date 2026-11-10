import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUser } from "@/lib/auth";
import { apiResult, smallJson, sameOrigin } from "@/lib/http";
import { reservation, completeUpload } from "@/lib/uploads";
import { AppError, assertWritableUser } from "@/lib/db";
import { scheduleDeletion } from "@/lib/storage";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(req: Request) {
  return apiResult(async () => {
    const body = (await smallJson(req)) as HandleUploadBody;
    return handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname, payload) => {
        sameOrigin(req);
        const user = await requireUser();
        await assertWritableUser(user.id);
        if (!payload || !/^[a-f0-9-]{36}$/.test(payload))
          throw new AppError("Upload reservation required");
        const r = await reservation(payload, user.id);
        if (r.pathname.startsWith("netlify:"))
          throw new AppError("Use the private upload endpoint", 400);
        if (pathname !== r.pathname || r.state !== "pending")
          throw new AppError("Upload reservation does not match", 403);
        return {
          maximumSizeInBytes: r.expected_size,
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Math.min(
            Date.now() + 15 * 60 * 1000,
            new Date(r.expires_at).getTime(),
          ),
          allowedContentTypes: [
            "text/plain",
            "text/markdown",
            "text/vtt",
            "application/x-subrip",
            "application/zip",
            "application/x-zip-compressed",
            "application/octet-stream",
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ],
          tokenPayload: r.id,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (
          !tokenPayload ||
          !blob.pathname.startsWith("incoming/") ||
          blob.pathname.split("/")[2] !== tokenPayload
        )
          throw new AppError("Upload reservation mismatch", 403);
        try {
          const r = await reservation(tokenPayload);
          if (blob.pathname !== r.pathname)
            throw new AppError("Upload path mismatch", 403);
          await completeUpload(r.id);
        } catch (error) {
          if (
            !(error instanceof AppError) ||
            ![402, 403, 404, 410].includes(error.status)
          )
            throw error;
          // This callback is provider-signed; deleted or expired reservations still need cleanup.
          await scheduleDeletion("blob:" + blob.pathname, 86400000);
        }
      },
    });
  });
}
