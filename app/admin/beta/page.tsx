import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { isBetaAdmin } from "@/lib/beta-admin";
import { query } from "@/lib/db";
import { InviteManager, type Invitation } from "./invite-manager";

export default async function BetaAdminPage() {
  const user = await currentUser();
  if (!user) redirect("/");
  if (!isBetaAdmin(user)) notFound();

  const invitations = await query<Invitation>(
    `SELECT i.slot,i.created_at::text,i.claimed_at IS NOT NULL AS claimed,u.email
     FROM beta_invitations i LEFT JOIN users u ON u.id=i.user_id ORDER BY i.slot`,
  );

  return (
    <main className="launch-info stack">
      <Link className="brand" href="/">
        evidence.
      </Link>
      <h1>Beta invitations</h1>
      <InviteManager invitations={invitations} />
    </main>
  );
}
