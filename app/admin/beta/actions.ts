"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { isBetaAdmin } from "@/lib/beta-admin";
import { approveBetaEmail } from "@/lib/beta-approval";
import { query, transaction } from "@/lib/db";

type ActionResult = { message?: string; error?: string };

export async function manageApproval(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  if (!isBetaAdmin(await currentUser())) return { error: "Access denied." };

  try {
    const remove = form.get("remove");
    if (remove !== null) {
      const id = z.uuid().parse(remove);
      const removed = await query(
        "DELETE FROM beta_invitations WHERE approval_id=$1 RETURNING slot",
        [id],
      );
      revalidatePath("/admin/beta");
      return removed.length
        ? { message: "Email removed from the beta list." }
        : { error: "That email has already been removed." };
    }
    if (form.get("add") !== "1") return { error: "Choose a beta list action." };
    const input = z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email().max(254))
      .safeParse(form.get("email"));
    if (!input.success) return { error: "Enter a valid email address." };
    const result = await transaction((client) =>
      approveBetaEmail(client, input.data),
    );
    if (result === "existing")
      return { error: "That email is already approved." };
    if (result === "full") return { error: "All beta slots are in use." };
    revalidatePath("/admin/beta");
    return { message: "Email added to the beta list." };
  } catch {
    return { error: "Could not update the beta list. Try again." };
  }
}
