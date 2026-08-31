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
import { CreditCard } from "lucide-react";

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

  // Anything still collectable — the latest open year is what the counter defaults to.
  const canCollect = hasPermission(perms, PERMISSIONS.FEE_COLLECT) && !!user.instituteId;
  const openRows = rows.filter((r) => !r.carriedForward && r.balance > 0);
  const collectTarget = openRows[openRows.length - 1];

  const totalFees = rows.reduce((s, r) => s + r.currentFees, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paid, 0);
  const currentDue = rows.filter((r) => !r.carriedForward).reduce((s, r) => s + r.balance, 0);

  return (
    <>
      <PageHeader
        title={`${student.name} — fee ledger`}
        description={`Admission #${student.admissionNo} · ${store.classes.get(student.classId)?.name ?? "—"} · year-wise dues and carried-forward balances`}
        actions={
          <div className="flex items-center gap-3">
            {canCollect && collectTarget && (
              <Link
                href={`/fees/collect/${collectTarget.assignment.id}`}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--color-brand)] px-3 text-sm font-medium text-white hover:brightness-110"
              >
                <CreditCard className="h-4 w-4" />Collect fees
              </Link>
            )}
            <Link href="/fees" className="text-sm text-[var(--color-brand)] hover:underline">Back to fees</Link>
          </div>
        }
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
          ...(canCollect ? [{
            key: "action",
            header: "",
            render: (r: (typeof rows)[number]) => (!r.carriedForward && r.balance > 0 ? (
              <div className="flex justify-end">
                <Link
                  href={`/fees/collect/${r.assignment.id}`}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-xs font-medium text-[var(--color-fg)] transition-colors hover:bg-[var(--color-border)]"
                >
                  <CreditCard className="h-3.5 w-3.5" />Collect
                </Link>
              </div>
            ) : null),
          }] : []),
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
