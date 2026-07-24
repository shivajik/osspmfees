import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { store } from "@/lib/db/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "./_print";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!hasPermission(permissionsForRole(user.role), PERMISSIONS.FEE_READ)) redirect("/dashboard");

  const p = store.feePayments.get(id);
  if (!p) notFound();
  if (user.instituteId && p.instituteId !== user.instituteId) notFound();

  const student = store.students.get(p.studentId);
  const assn = store.feeAssignments.get(p.assignmentId);
  const structure = assn ? store.feeStructures.get(assn.feeStructureId) : undefined;
  const cls = student ? store.classes.get(student.classId) : undefined;
  const batch = student ? store.batches.get(student.batchId) : undefined;
  const institute = store.institutes.get(p.instituteId);
  const account = p.accountId ? store.accounts.get(p.accountId) : undefined;

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/fees" className="inline-flex items-center gap-1.5 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
          <ArrowLeft className="h-4 w-4" /> Back to fees
        </Link>
        <PrintButton />
      </div>

      <div className="card mx-auto max-w-3xl p-8">
        <div className="flex items-start justify-between border-b border-[var(--color-border)] pb-6">
          <div>
            <div className="text-lg font-bold tracking-tight">{institute?.name}</div>
            <div className="text-xs text-[var(--color-fg-muted)]">{institute?.address}</div>
            <div className="text-xs text-[var(--color-fg-muted)]">{institute?.phone} · {institute?.email}</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest text-[var(--color-fg-subtle)]">Fee Receipt</div>
            <div className="mt-1 font-mono text-lg font-semibold">{p.receiptNo}</div>
            <div className="text-xs text-[var(--color-fg-muted)]">{formatDate(p.paidAt)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 py-6 text-sm">
          <div>
            <div className="text-xs uppercase text-[var(--color-fg-subtle)]">Received from</div>
            <div className="mt-1 font-semibold">{student?.name}</div>
            <div className="text-xs text-[var(--color-fg-muted)]">Admission #: <span className="font-mono">{student?.admissionNo}</span></div>
            <div className="text-xs text-[var(--color-fg-muted)]">Class: {cls?.name} · {batch?.name}</div>
            {student?.guardianName && <div className="text-xs text-[var(--color-fg-muted)]">Guardian: {student.guardianName}</div>}
          </div>
          <div>
            <div className="text-xs uppercase text-[var(--color-fg-subtle)]">Payment</div>
            <div className="mt-1 text-xs text-[var(--color-fg-muted)]">Mode: <span className="font-medium text-[var(--color-fg)]">{p.mode}</span></div>
            {account && <div className="text-xs text-[var(--color-fg-muted)]">Account: {account.name}</div>}
            {p.reference && <div className="text-xs text-[var(--color-fg-muted)]">Ref: <span className="font-mono">{p.reference}</span></div>}
            <div className="text-xs text-[var(--color-fg-muted)]">Cashier: {p.createdByName}</div>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-2)] text-xs uppercase text-[var(--color-fg-muted)]">
            <tr><th className="px-3 py-2 text-left font-medium">Description</th><th className="px-3 py-2 text-right font-medium">Amount</th></tr>
          </thead>
          <tbody>
            <tr className="border-t border-[var(--color-border)]">
              <td className="px-3 py-3">
                <div className="font-medium">{structure?.name ?? "Fee payment"}</div>
                <div className="text-xs text-[var(--color-fg-muted)]">Assignment payment</div>
              </td>
              <td className="px-3 py-3 text-right font-semibold">{formatCurrency(p.amount)}</td>
            </tr>
            <tr className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]">
              <td className="px-3 py-3 text-right text-xs font-medium uppercase text-[var(--color-fg-muted)]">Total received</td>
              <td className="px-3 py-3 text-right text-lg font-bold">{formatCurrency(p.amount)}</td>
            </tr>
          </tbody>
        </table>

        {assn && (
          <div className="mt-4 flex justify-end gap-6 text-xs text-[var(--color-fg-muted)]">
            <div>Total payable: <span className="font-medium text-[var(--color-fg)]">{formatCurrency(assn.totalPayable)}</span></div>
            <div>Paid to date: <span className="font-medium text-emerald-600">{formatCurrency(assn.totalPaid)}</span></div>
            <div>Balance: <span className="font-medium text-amber-600">{formatCurrency(assn.totalPayable - assn.totalPaid)}</span></div>
          </div>
        )}

        <div className="mt-10 flex items-end justify-between border-t border-[var(--color-border)] pt-6 text-xs text-[var(--color-fg-muted)]">
          <div>Thank you for your payment. This is a system-generated receipt.</div>
          <div className="text-right">
            <div className="border-t border-dashed border-[var(--color-border-strong)] pt-2 w-40">Authorized signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
}
