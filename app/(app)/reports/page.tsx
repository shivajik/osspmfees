import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { scopeByInstitute, store } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Download } from "lucide-react";

type Tab = "daily" | "monthly" | "student" | "pending" | "expense" | "cashbook" | "bank";

const TABS: { key: Tab; label: string; needs?: string }[] = [
  { key: "daily", label: "Daily collection" },
  { key: "monthly", label: "Monthly collection" },
  { key: "student", label: "Student collection" },
  { key: "pending", label: "Pending fees" },
  { key: "expense", label: "Expense summary" },
  { key: "cashbook", label: "Cash book" },
  { key: "bank", label: "Bank ledger" },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.REPORT_VIEW)) redirect("/dashboard");
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "daily") as Tab;

  const scope = user.instituteId;
  const payments = scopeByInstitute(store.feePayments.values(), scope);
  const expenses = scopeByInstitute(store.expenses.values(), scope);
  const assignments = scopeByInstitute(store.feeAssignments.values(), scope);
  const txns = scopeByInstitute(store.transactions.values(), scope);
  const accounts = scopeByInstitute(store.accounts.values(), scope);

  return (
    <>
      <PageHeader
        title="Reports"
        description="Analytics, ledgers and exportable statements."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportLink tab={tab} format="csv" label="CSV" />
            <ExportLink tab={tab} format="xlsx" label="Excel" />
            <ExportLink tab={tab} format="pdf" label="PDF" />
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1 border-b border-[var(--color-border)]">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/reports?tab=${t.key}`}
            className={cn(
              "border-b-2 px-3 py-2 text-sm",
              tab === t.key
                ? "border-[var(--color-brand)] text-[var(--color-brand)] font-medium"
                : "border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "daily" && <Daily payments={payments} />}
      {tab === "monthly" && <Monthly payments={payments} />}
      {tab === "student" && <StudentSummary payments={payments} assignments={assignments} />}
      {tab === "pending" && <Pending assignments={assignments} />}
      {tab === "expense" && <ExpenseSummary expenses={expenses} />}
      {tab === "cashbook" && <Ledger accounts={accounts} txns={txns} type="CASH" />}
      {tab === "bank" && <Ledger accounts={accounts} txns={txns} type="BANK" />}
    </>
  );
}

function groupBy<T>(arr: T[], keyFn: (t: T) => string): Record<string, T[]> {
  return arr.reduce((acc, x) => {
    const k = keyFn(x);
    (acc[k] ??= []).push(x);
    return acc;
  }, {} as Record<string, T[]>);
}

function Daily({ payments }: { payments: ReturnType<typeof scopeByInstitute<import("@/lib/db/store").FeePayment>> }) {
  const g = groupBy(payments, (p) => p.paidAt.slice(0, 10));
  const rows = Object.entries(g)
    .map(([day, ps]) => ({ id: day, day, count: ps.length, total: ps.reduce((s, p) => s + p.amount, 0) }))
    .sort((a, b) => b.day.localeCompare(a.day));
  const total = rows.reduce((s, r) => s + r.total, 0);
  return (
    <>
      <SummaryLine label="Total collected" value={formatCurrency(total)} />
      <DataTable rowKey={(r) => r.id} rows={rows} empty="No collections"
        columns={[
          { key: "day", header: "Date", render: (r) => formatDate(r.day) },
          { key: "count", header: "Receipts", render: (r) => r.count },
          { key: "total", header: "Amount", render: (r) => <span className="font-semibold">{formatCurrency(r.total)}</span> },
        ]}
      />
    </>
  );
}

function Monthly({ payments }: { payments: ReturnType<typeof scopeByInstitute<import("@/lib/db/store").FeePayment>> }) {
  const g = groupBy(payments, (p) => p.paidAt.slice(0, 7));
  const rows = Object.entries(g)
    .map(([m, ps]) => ({ id: m, month: m, count: ps.length, total: ps.reduce((s, p) => s + p.amount, 0) }))
    .sort((a, b) => b.month.localeCompare(a.month));
  return (
    <DataTable rowKey={(r) => r.id} rows={rows} empty="No collections"
      columns={[
        { key: "month", header: "Month", render: (r) => r.month },
        { key: "count", header: "Receipts", render: (r) => r.count },
        { key: "total", header: "Amount", render: (r) => <span className="font-semibold">{formatCurrency(r.total)}</span> },
      ]}
    />
  );
}

function StudentSummary({
  payments, assignments,
}: {
  payments: ReturnType<typeof scopeByInstitute<import("@/lib/db/store").FeePayment>>;
  assignments: ReturnType<typeof scopeByInstitute<import("@/lib/db/store").FeeAssignment>>;
}) {
  const byStudent = new Map<string, { paid: number; payable: number }>();
  assignments.forEach((a) => {
    const cur = byStudent.get(a.studentId) ?? { paid: 0, payable: 0 };
    cur.payable += a.totalPayable; cur.paid += a.totalPaid;
    byStudent.set(a.studentId, cur);
  });
  const rows = Array.from(byStudent.entries()).map(([sid, v]) => {
    const s = store.students.get(sid);
    return { id: sid, name: s?.name ?? sid, adm: s?.admissionNo ?? "", payable: v.payable, paid: v.paid, balance: v.payable - v.paid };
  }).sort((a, b) => b.balance - a.balance);
  return (
    <DataTable rowKey={(r) => r.id} rows={rows} empty="No students"
      columns={[
        { key: "adm", header: "Admission #", render: (r) => <span className="font-mono text-xs">{r.adm}</span> },
        { key: "name", header: "Student", render: (r) => <span className="font-medium">{r.name}</span> },
        { key: "payable", header: "Payable", render: (r) => formatCurrency(r.payable) },
        { key: "paid", header: "Paid", render: (r) => <span className="text-emerald-600">{formatCurrency(r.paid)}</span> },
        { key: "bal", header: "Balance", render: (r) => <span className="text-amber-600 font-semibold">{formatCurrency(r.balance)}</span> },
      ]}
    />
  );
}

function Pending({ assignments }: { assignments: ReturnType<typeof scopeByInstitute<import("@/lib/db/store").FeeAssignment>> }) {
  const rows = assignments
    .filter((a) => a.status !== "PAID")
    .map((a) => {
      const s = store.students.get(a.studentId);
      const cls = s ? store.classes.get(s.classId) : undefined;
      return { id: a.id, name: s?.name ?? "", adm: s?.admissionNo ?? "", cls: cls?.name ?? "", balance: a.totalPayable - a.totalPaid, status: a.status };
    })
    .sort((a, b) => b.balance - a.balance);
  const total = rows.reduce((s, r) => s + r.balance, 0);
  return (
    <>
      <SummaryLine label="Total outstanding" value={formatCurrency(total)} />
      <DataTable rowKey={(r) => r.id} rows={rows} empty="Nothing pending — great!"
        columns={[
          { key: "adm", header: "Admission #", render: (r) => <span className="font-mono text-xs">{r.adm}</span> },
          { key: "name", header: "Student", render: (r) => <span className="font-medium">{r.name}</span> },
          { key: "cls", header: "Class", render: (r) => r.cls },
          { key: "bal", header: "Balance", render: (r) => <span className="text-amber-600 font-semibold">{formatCurrency(r.balance)}</span> },
          { key: "status", header: "Status", render: (r) => <Badge tone={r.status === "PARTIAL" ? "info" : "warning"}>{r.status}</Badge> },
        ]}
      />
    </>
  );
}

function ExpenseSummary({ expenses }: { expenses: ReturnType<typeof scopeByInstitute<import("@/lib/db/store").Expense>> }) {
  const g = groupBy(expenses, (e) => e.categoryId);
  const rows = Object.entries(g).map(([cid, es]) => ({
    id: cid, category: store.expenseCategories.get(cid)?.name ?? "—",
    count: es.length, total: es.reduce((s, e) => s + e.amount, 0),
  })).sort((a, b) => b.total - a.total);
  const total = rows.reduce((s, r) => s + r.total, 0);
  return (
    <>
      <SummaryLine label="Total expenses" value={formatCurrency(total)} />
      <DataTable rowKey={(r) => r.id} rows={rows} empty="No expenses"
        columns={[
          { key: "cat", header: "Category", render: (r) => <span className="font-medium">{r.category}</span> },
          { key: "count", header: "Vouchers", render: (r) => r.count },
          { key: "total", header: "Amount", render: (r) => <span className="font-semibold">{formatCurrency(r.total)}</span> },
        ]}
      />
    </>
  );
}

function Ledger({
  accounts, txns, type,
}: {
  accounts: ReturnType<typeof scopeByInstitute<import("@/lib/db/store").Account>>;
  txns: ReturnType<typeof scopeByInstitute<import("@/lib/db/store").Transaction>>;
  type: "BANK" | "CASH";
}) {
  const accIds = new Set(accounts.filter((a) => a.type === type).map((a) => a.id));
  const rows = txns.filter((t) => accIds.has(t.accountId))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const balance = accounts.filter((a) => a.type === type).reduce((s, a) => s + a.currentBal, 0);
  return (
    <>
      <SummaryLine label={`${type} balance`} value={formatCurrency(balance)} />
      <DataTable rowKey={(r) => r.id} rows={rows} empty="No transactions"
        columns={[
          { key: "date", header: "Date", render: (r) => formatDate(r.occurredAt) },
          { key: "acc", header: "Account", render: (r) => store.accounts.get(r.accountId)?.name ?? "—" },
          { key: "ref", header: "Reference", render: (r) => <span className="text-xs">{r.reference ?? "—"}</span> },
          { key: "dir", header: "Type", render: (r) => <Badge tone={r.direction === "CREDIT" ? "success" : "warning"}>{r.direction}</Badge> },
          { key: "amt", header: "Amount", render: (r) => <span className={r.direction === "CREDIT" ? "text-emerald-600 font-semibold" : "text-amber-700 font-semibold"}>{r.direction === "CREDIT" ? "+" : "-"}{formatCurrency(r.amount)}</span> },
          { key: "bal", header: "Balance", render: (r) => formatCurrency(r.balanceAfter) },
        ]}
      />
    </>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <Card className="mb-4">
      <CardHeader><div><CardTitle>{label}</CardTitle><CardDescription>Current filter</CardDescription></div></CardHeader>
      <p className="text-3xl font-semibold">{value}</p>
    </Card>
  );
}

function ExportLink({ tab, format, label }: { tab: string; format: "csv" | "xlsx" | "pdf"; label: string }) {
  return (
    <Link
      href={`/api/reports/export?tab=${tab}&format=${format}`}
      className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--color-border-strong)] px-3 text-sm font-medium hover:bg-[var(--color-surface-2)]"
    >
      <Download className="h-4 w-4" /> {label}
    </Link>
  );
}
