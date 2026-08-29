import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { store, assignmentBalance } from "@/lib/db/store";
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
  const structure = store.feeStructures.get(assignment.feeStructureId);
  const accounts = Array.from(store.accounts.values())
    .filter((a) => a.instituteId === user.instituteId)
    .map((a) => ({ id: a.id, name: a.name, type: a.type }));

  // Sum what's already been paid against each structure head, across every
  // prior payment on this assignment, so the form can suggest what's still
  // owed per head instead of a generic checklist.
  const paidPerHead = new Map<string, number>();
  for (const p of store.feePayments.values()) {
    if (p.assignmentId !== assignmentId) continue;
    for (const h of p.feeHeadBreakup ?? []) {
      paidPerHead.set(h.head, (paidPerHead.get(h.head) ?? 0) + h.amount);
    }
  }
  const heads = (structure?.items ?? []).map((it) => ({
    head: it.head,
    remaining: Math.max(0, it.amount - (paidPerHead.get(it.head) ?? 0)),
  }));

  const previousDue = Math.max(0, (assignment.previousBalance ?? 0) - assignment.totalPaid);

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
