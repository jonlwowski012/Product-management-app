import { authorizeOperations } from "@/lib/operations-auth";
import { maintainWorkspace, workspaceHealth } from "@/lib/maintenance";
import { apiResult } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(req: Request) {
  return apiResult(async () => {
    authorizeOperations(req);
    if (new URL(req.url).searchParams.get("health") === "1")
      return { health: await workspaceHealth() };
    return maintainWorkspace();
  });
}
