"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { isBetaAdmin } from "@/lib/beta-admin";
import { BETA_SEATS } from "@/lib/beta-config";
import { query, transaction } from "@/lib/db";

type ActionResult = { link?: string; message?: string; error?: string };

export async function manageInvite(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  if (!isBetaAdmin(await currentUser())) return { error: "Access denied." };

  try {
    const target = form.get("revoke");
    if (target !== null) {
      const input = z
        .tuple([
          z.coerce.number().int().min(1).max(BETA_SEATS),
          z.string().max(64),
        ])
        .parse(String(target).split("|"));
      const removed = await query(
        "DELETE FROM beta_invitations WHERE slot=$1 AND created_at=$2::timestamptz AND claimed_at IS NULL RETURNING slot",
        input,
      );
      revalidatePath("/admin/beta");
      return removed.length
        ? { message: "Invitation revoked. The slot is available again." }
        : { error: "That invitation was already claimed or changed." };
    }

    const origin = new URL(process.env.APP_URL ?? "");
    const localDevelopment =
      process.env.NODE_ENV === "development" &&
      origin.protocol === "http:" &&
      origin.hostname === "127.0.0.1";
    if (origin.protocol !== "https:" && !localDevelopment)
      return { error: "Set APP_URL to the hosted beta HTTPS address." };
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    const created = await transaction(async (client) => {
      await client.query("LOCK TABLE beta_invitations IN EXCLUSIVE MODE");
      const result = await client.query(
        `INSERT INTO beta_invitations(slot,token_hash)
         SELECT n,$1 FROM generate_series(1,$2::int) n
         WHERE NOT EXISTS(SELECT 1 FROM beta_invitations WHERE slot=n)
         ORDER BY n LIMIT 1 RETURNING slot`,
        [hash, BETA_SEATS],
      );
      return result.rowCount === 1;
    });
    revalidatePath("/admin/beta");
    return created
      ? { link: origin.origin + "/#invite=" + token }
      : { error: "All beta slots are in use." };
  } catch {
    return {
      error: "Could not update the invitation. Refresh before trying again.",
    };
  }
}
