import { apiResult } from "@/lib/http";
import { AppError } from "@/lib/db";
import { stripe, processBillingEvent } from "@/lib/billing";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return apiResult(async () => {
    if (!process.env.STRIPE_WEBHOOK_SECRET)
      throw new AppError("Billing webhook is not configured", 503);
    const reader = req.body?.getReader();
    if (!reader) throw new AppError("Event body required");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 262144) {
        await reader.cancel();
        throw new AppError("Event too large", 413);
      }
      chunks.push(value);
    }
    let event;
    try {
      event = stripe().webhooks.constructEvent(
        Buffer.concat(chunks),
        req.headers.get("stripe-signature") || "",
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      throw new AppError("Invalid event signature", 400);
    }
    await processBillingEvent(event);
    return { received: true };
  });
}
