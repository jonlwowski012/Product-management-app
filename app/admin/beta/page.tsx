import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { isBetaAdmin } from "@/lib/beta-admin";
import { query } from "@/lib/db";
import { ApprovalList, type Approval } from "./approval-list";

export default async function BetaAdminPage() {
  const user = await currentUser();
  if (!user) redirect("/");
  if (!isBetaAdmin(user)) notFound();

  const approvals = await query<Approval>(
    `SELECT i.approval_id AS id,COALESCE(i.approved_email,u.email) AS email,i.user_id IS NOT NULL AS active
     FROM beta_invitations i LEFT JOIN users u ON u.id=i.user_id
     WHERE i.approved_email IS NOT NULL OR i.user_id IS NOT NULL ORDER BY i.slot`,
  );

  return (
    <main className="launch-info stack">
      <Link className="brand" href="/">
        evidence.
      </Link>
      <h1>Beta access</h1>
      <ApprovalList approvals={approvals} />
    </main>
  );
}
