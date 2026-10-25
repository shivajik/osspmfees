import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { store, studentLedger, isActivePayment } from "@/lib/db/store";
import { AddChargeButton, EditPaymentButton, RemoveChargeButton, ReversePaymentButton } from "../../_actions";
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
  const canAdjust = hasPermission(perms, PERMISSIONS.FEE_ADJUST) && !!user.instituteId;
  const yearNameOf = (assignmentId: string) => rows.find((r) => r.assignment.id === assignmentId)?.yearName ?? "earlier year";
  // Charges go on the latest year that is still open, even if it is fully paid.
  const chargeTarget = [...rows].reverse().find((r) => !r.carriedForward);
  const charges = rows.flatMap((r) => (r.assignment.extraItems ?? []).map((c) => ({ ...c, row: r })));
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
            {canCollect && (collectTarget ? (
              <Link
                href={`/fees/collect/${collectTarget.assignment.id}`}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--color-brand)] px-3 text-sm font-medium text-white hover:brightness-110"
              >
                <CreditCard className="h-4 w-4" />Collect fees
              </Link>
            ) : (
              // Nothing outstanding to collect against — the counter is also where
              // this student's fees get set up in the first place.
              <Link
                href={`/fees/collect?classId=${student.classId}&studentId=${student.id}`}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--color-border-strong)] px-3 text-sm font-medium hover:bg-[var(--color-surface-2)]"
              >
                <CreditCard className="h-4 w-4" />{rows.length === 0 ? "Set up fees" : "Add fees"}
              </Link>
            ))}
            <Link href="/fees" className="text-sm text-[var(--color-brand)] hover:underline">Back to fees</Link>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card><CardHeader><div><CardTitle>Fees charged</CardTitle><CardDescription>All years (after discount)</CardDescription></div></CardHeader><p className="text-2xl font-semibold">{formatCurrency(totalFees)}</p></Card>
        <Card><CardHeader><div><CardTitle>Total paid</CardTitle><CardDescription>All receipts</CardDescription></div></CardHeader><p className="text-2xl font-semibold text-emerald-600">{formatCurrency(totalPaid)}</p></Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Balance due</CardTitle>
              <CardDescription>{rows.length === 0 ? "Nothing charged yet" : "Current year incl. carry-forward"}</CardDescription>
            </div>
          </CardHeader>
          {rows.length === 0
            ? <p className="text-sm text-[var(--color-fg-muted)]">No fees set for this student yet.</p>
            : <p className="text-2xl font-semibold text-amber-600">{formatCurrency(currentDue)}</p>}
        </Card>
      </div>

      <div className="mb-2 text-sm font-medium">Year-wise ledger</div>
      <DataTable
        rowKey={(r) => r.assignment.id}
        rows={rows}
        empty="No fee assignments for this student yet"
        columns={[
          { key: "year", header: "Academic year", render: (r) => <span className="font-medium">{r.yearName}</span> },
          { key: "fs", header: "Structure", render: (r) => r.structureName },
          { key: "prev", header: "Previous balance", render: (r) => (
            <div>
              <div>{formatCurrency(r.previousBalance)}</div>
              {(r.assignment.carriedFrom?.length ?? 0) > 0 && (
                <div className="text-xs text-[var(--color-fg-muted)]">from {r.assignment.carriedFrom!.map(yearNameOf).join(", ")}</div>
              )}
            </div>
          ) },
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

      <div className="mt-8 mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">Additional charges</div>
        {canAdjust && chargeTarget && (
          <AddChargeButton assignmentId={chargeTarget.assignment.id} yearName={chargeTarget.yearName} />
        )}
      </div>
      <DataTable
        rowKey={(c) => c.id}
        rows={charges}
        empty="No conditional charges (e.g. TC fees) added for this student"
        columns={[
          { key: "year", header: "Academic year", render: (c) => c.row.yearName },
          { key: "head", header: "Fee head", render: (c) => <span className="font-medium">{c.head}</span> },
          { key: "reason", header: "Reason", render: (c) => c.reason ?? "—" },
          { key: "by", header: "Added", render: (c) => (
            <div className="text-xs">{formatDate(c.addedAt)}<div className="text-[var(--color-fg-muted)]">by {c.addedByName}</div></div>
          ) },
          { key: "amt", header: "Amount", render: (c) => <span className="font-semibold">{formatCurrency(c.amount)}</span> },
          ...(canAdjust ? [{
            key: "action", header: "",
            render: (c: (typeof charges)[number]) => (c.row.carriedForward ? null : (
              <div className="flex justify-end"><RemoveChargeButton assignmentId={c.row.assignment.id} chargeId={c.id} label={c.head} /></div>
            )),
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
          { key: "heads", header: "Fee heads", render: (p) => (
            <div className="text-xs">
              {(p.feeHeadBreakup ?? []).map((h) => <div key={h.head}>{h.head}: {formatCurrency(h.amount)}</div>)}
              {(p.discount ?? 0) > 0 && <div className="text-sky-600">incl. discount {formatCurrency(p.discount ?? 0)}</div>}
            </div>
          ) },
          { key: "mode", header: "Mode", render: (p) => (
            <div>
              <Badge tone="neutral">{p.mode}</Badge>
              {p.cheque && <div className="mt-1 text-xs text-[var(--color-fg-muted)]">#{p.cheque.chequeNo} · {p.cheque.bankName}</div>}
            </div>
          )},
          { key: "prev", header: "To previous balance", render: (p) => formatCurrency(p.appliedToPrevious ?? 0) },
          { key: "cur", header: "To current year", render: (p) => formatCurrency(p.appliedToCurrent ?? p.amount) },
          { key: "amt", header: "Amount", render: (p) => isActivePayment(p)
            ? <span className="font-semibold">{formatCurrency(p.amount)}</span>
            : (
              <div>
                <span className="font-semibold line-through text-[var(--color-fg-muted)]">{formatCurrency(p.amount)}</span>
                <div><Badge tone="danger">Reversed</Badge></div>
                <div className="text-xs text-[var(--color-fg-muted)]">{p.voidReason} · {p.voidedByName}</div>
              </div>
            ) },
          ...(canCollect ? [{
            key: "action", header: "",
            render: (p: (typeof payments)[number]) => (isActivePayment(p) ? (
              <div className="flex justify-end gap-1">
                <EditPaymentButton payment={{ id: p.id, receiptNo: p.receiptNo, amount: p.amount, mode: p.mode, reference: p.reference, cheque: p.cheque }} />
                {canAdjust && <ReversePaymentButton payment={{ id: p.id, receiptNo: p.receiptNo, amount: p.amount, discount: p.discount }} />}
              </div>
            ) : null),
          }] : []),
        ]}
      />
    </>
  );
}
