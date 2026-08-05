import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { store, studentLedger } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function StudentLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.FEE_READ)) redirect("/dashboard");

  const { id } = await params;
  const student = store.students.get(id);
  if (!student) notFound();
  if (user.instituteId && student.instituteId !== user.instituteId) redirect("/fees");

  const rows = studentLedger(student.id);
  const payments = Array.from(store.feePayments.values())
    .filter((p) => p.studentId === student.id)
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt));

  const totalFees = rows.reduce((s, r) => s + r.currentFees, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paid, 0);
  const currentDue = rows.filter((r) => !r.carriedForward).reduce((s, r) => s + r.balance, 0);

  return (
    <>
      <PageHeader
        title={`${student.name} — fee ledger`}
        description={`Admission #${student.admissionNo} · ${store.classes.get(student.classId)?.name ?? "—"} · year-wise dues and carried-forward balances`}
        actions={<Link href="/fees" className="text-sm text-[var(--color-brand)] hover:underline">Back to fees</Link>}
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card><CardHeader><div><CardTitle>Fees charged</CardTitle><CardDescription>All years (after discount)</CardDescription></div></CardHeader><p className="text-2xl font-semibold">{formatCurrency(totalFees)}</p></Card>
        <Card><CardHeader><div><CardTitle>Total paid</CardTitle><CardDescription>All receipts</CardDescription></div></CardHeader><p className="text-2xl font-semibold text-emerald-600">{formatCurrency(totalPaid)}</p></Card>
        <Card><CardHeader><div><CardTitle>Balance due</CardTitle><CardDescription>Current year incl. carry-forward</CardDescription></div></CardHeader><p className="text-2xl font-semibold text-amber-600">{formatCurrency(currentDue)}</p></Card>
      </div>

      <div className="mb-2 text-sm font-medium">Year-wise ledger</div>
      <DataTable
        rowKey={(r) => r.assignment.id}
        rows={rows}
        empty="No fee assignments for this student yet"
        columns={[
          { key: "year", header: "Academic year", render: (r) => <span className="font-medium">{r.yearName}</span> },
          { key: "fs", header: "Structure", render: (r) => r.structureName },
          { key: "prev", header: "Previous balance", render: (r) => formatCurrency(r.previousBalance) },
          { key: "fees", header: "Year fees", render: (r) => formatCurrency(r.currentFees) },
          { key: "disc", header: "Discount", render: (r) => r.discount > 0 ? (
            <div>
              <div className="text-sky-600">− {formatCurrency(r.discount)}</div>
              <div className="text-xs text-[var(--color-fg-muted)]">by {r.assignment.discountByName ?? "—"}</div>
            </div>
          ) : "—" },
          { key: "total", header: "Total payable", render: (r) => <span className="font-medium">{formatCurrency(r.grossPayable)}</span> },
          { key: "paid", header: "Paid", render: (r) => <span className="text-emerald-600">{formatCurrency(r.paid)}</span> },
          { key: "bal", header: "Balance", render: (r) => r.carriedForward
            ? <Badge tone="neutral">Carried forward</Badge>
            : <span className="font-medium text-amber-600">{formatCurrency(r.balance)}</span> },
        ]}
      />

      <div className="mt-8 mb-2 text-sm font-medium">Payment history</div>
      <DataTable
        rowKey={(p) => p.id}
        rows={payments}
        empty="No payments recorded"
        columns={[
          { key: "receipt", header: "Receipt", render: (p) => (
            <Link href={`/fees/receipts/${p.id}`} className="font-medium text-[var(--color-brand)] hover:underline">{p.receiptNo}</Link>
          )},
          { key: "date", header: "Date", render: (p) => formatDate(p.paidAt) },
          { key: "mode", header: "Mode", render: (p) => (
            <div>
              <Badge tone="neutral">{p.mode}</Badge>
              {p.cheque && <div className="mt-1 text-xs text-[var(--color-fg-muted)]">#{p.cheque.chequeNo} · {p.cheque.bankName}</div>}
            </div>
          )},
          { key: "prev", header: "To previous balance", render: (p) => formatCurrency(p.appliedToPrevious ?? 0) },
          { key: "cur", header: "To current year", render: (p) => formatCurrency(p.appliedToCurrent ?? p.amount) },
          { key: "amt", header: "Amount", render: (p) => <span className="font-semibold">{formatCurrency(p.amount)}</span> },
        ]}
      />
    </>
  );
}
