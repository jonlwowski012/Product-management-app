import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiResult, smallJson, sameOrigin } from "@/lib/http";
import { completeUpload } from "@/lib/uploads";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(req: Request) {
  return apiResult(async () => {
    sameOrigin(req);
    const user = await requireUser();
    const { id } = z.object({ id: z.uuid() }).parse(await smallJson(req));
    return completeUpload(id, user.id);
  });
}
