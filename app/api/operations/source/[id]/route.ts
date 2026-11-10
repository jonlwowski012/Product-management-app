import { z } from "zod";
import { authorizeOperations } from "@/lib/operations-auth";
import { query, AppError } from "@/lib/db";
import { apiResult } from "@/lib/http";
import { originalStream } from "@/lib/storage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return apiResult(async () => {
    authorizeOperations(request);
    const id = z.uuid().parse((await context.params).id);
    const [source] = await query(
      "SELECT storage_path FROM discovery_sources WHERE id=$1",
      [id],
    );
    if (!source?.storage_path?.startsWith("netlify:"))
      throw new AppError("Source unavailable", 404);
    return new Response(await originalStream(source.storage_path, ""), {
      headers: {
        "content-type": "application/octet-stream",
        "cache-control": "no-store",
      },
    });
  });
}
