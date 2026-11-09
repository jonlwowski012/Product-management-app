import { createHash } from "node:crypto";
import { z } from "zod";

// IDs belong to a published report. New reports never silently inherit a decision by array position or title.
export const opportunityId = (reportId: string, index: number) =>
  createHash("sha256")
    .update(`${reportId}\0${index}`)
    .digest("hex")
    .slice(0, 32);

export const validationWorkInput = z
  .object({
    version: z.number().int().min(0),
    status: z.enum(["chosen", "testing", "reviewed"]),
    activity: z.string().trim().max(2000),
    learning: z.string().trim().max(5000),
    outcome: z.enum(["supported", "challenged", "inconclusive"]).nullable(),
  })
  .refine((v) => v.status !== "reviewed" || (!!v.outcome && !!v.learning), {
    message:
      "Record what you learned and choose an outcome before marking this reviewed.",
  });
