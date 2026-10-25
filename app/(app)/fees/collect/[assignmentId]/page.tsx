import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { store, assignmentBalance, assignmentHeadOutstanding, previousDue as previousDueOf } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { CollectFeeForm } from "./_form";

export default async function CollectPaymentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.FEE_COLLECT)) redirect("/fees");
  if (!user.instituteId) redirect("/fees");

  const { assignmentId } = await params;
  const assignment = store.feeAssignments.get(assignmentId);
  if (!assignment || assignment.instituteId !== user.instituteId) notFound();
  if (assignment.carriedForwardTo) redirect("/fees");

  const balance = assignmentBalance(assignment);
  if (balance <= 0) redirect("/fees");

  const student = store.students.get(assignment.studentId);
  const accounts = Array.from(store.accounts.values())
    .filter((a) => a.instituteId === user.instituteId)
    .map((a) => ({ id: a.id, name: a.name, type: a.type }));

  // Per-head dues (previous-year balance first) — the server re-validates the
  // allocation against the same numbers, so the form is only a convenience.
  const heads = assignmentHeadOutstanding(assignment).map((h) => ({ head: h.head, remaining: h.amount }));
  const previousDue = previousDueOf(assignment);

  return (
    <>
      <Link href="/fees" className="mb-3 inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
        <ArrowLeft className="h-3.5 w-3.5" />Back to fees
      </Link>
      <PageHeader
        title={`Collect fee — ${student?.name ?? "Student"}`}
        description={
          previousDue > 0
            ? `Outstanding ₹${balance.toLocaleString("en-IN")} — includes ₹${previousDue.toLocaleString("en-IN")} carried forward from earlier years`
            : `Outstanding balance: ₹${balance.toLocaleString("en-IN")}`
        }
      />
      <CollectFeeForm
        assignmentId={assignment.id}
        balance={balance}
        previousDue={previousDue}
        heads={heads}
        accounts={accounts}
      />
    </>
  );
}
