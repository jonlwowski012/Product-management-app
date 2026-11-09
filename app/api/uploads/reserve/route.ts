import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiResult, smallJson, sameOrigin } from "@/lib/http";
import { reserveUploads } from "@/lib/uploads";
export const runtime = "nodejs";
export async function POST(req: Request) {
  return apiResult(async () => {
    sameOrigin(req);
    const user = await requireUser();
    const input = z
      .object({
        customer_id: z.uuid().nullable().default(null),
        discovery: z.boolean().default(false),
        title: z.string().max(200).default(""),
        files: z
          .array(
            z.object({
              name: z
                .string()
                .min(1)
                .max(200)
                .regex(
                  /^[^/\\]+\.(txt|md|markdown|vtt|srt|zip|pdf|pptx|docx)$/i,
                ),
              size: z.number().int().positive().max(10485760),
            }),
          )
          .min(1)
          .max(30),
      })
      .parse(await smallJson(req));
    if (!input.discovery && !input.customer_id)
      throw new Error("Customer required");
    return reserveUploads(
      user.id,
      input.customer_id,
      input.title,
      input.files,
      input.discovery,
    );
  });
}
