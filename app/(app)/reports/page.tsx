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
import { InstituteFilter } from "./_filters";

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

const instituteName = (id: string) => store.institutes.get(id)?.name ?? "—";

/** Who took the money, and under which role — one entry per distinct collector. */
function collectorsFor(payments: { createdBy: string; createdByName: string }[]) {
  const seen = new Map<string, string>();
  for (const p of payments) {
    const u = store.users.get(p.createdBy);
    const name = p.createdByName || u?.name || "—";
    if (!seen.has(name)) seen.set(name, u?.role ?? "");
  }
  return Array.from(seen, ([name, role]) => ({ name, role }));
}

function Collectors({ people }: { people: { name: string; role: string }[] }) {
  if (people.length === 0) return <span className="text-[var(--color-fg-subtle)]">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {people.map((p) => (
        <div key={p.name} className="flex items-center gap-1.5">
          <span className="text-sm">{p.name}</span>
          {p.role && (
            <span className="text-[10px] uppercase tracking-wide text-[var(--color-fg-subtle)]">
              {p.role.replace("_", " ")}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.REPORT_VIEW)) redirect("/dashboard");
  const sp = await searchParams;
  const pick = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const tab = (TABS.find((t) => t.key === pick("tab"))?.key ?? "daily") as Tab;

  // Institute admins stay pinned to their own tenant; a super admin can narrow to
  // one institute, or leave it on All and read the institute column instead.
  const requested = pick("instituteId");
  const chosen = !user.instituteId && store.institutes.has(requested) ? requested : null;
  const scope = user.instituteId ?? chosen;
  const showInstitute = !scope;
  const instituteOptions = user.instituteId
    ? []
    : Array.from(store.institutes.values()).map((i) => ({ id: i.id, name: i.name }));

  const payments = scopeByInstitute(store.feePayments.values(), scope);
  const expenses = scopeByInstitute(store.expenses.values(), scope);
  const assignments = scopeByInstitute(store.feeAssignments.values(), scope);
  const txns = scopeByInstitute(store.transactions.values(), scope);
  const accounts = scopeByInstitute(store.accounts.values(), scope);

  const qs = (extra: Record<string, string>) =>
    new URLSearchParams({ ...(chosen ? { instituteId: chosen } : {}), ...extra }).toString();

  return (
    <>
      <PageHeader
        title="Reports"
        description={
          scope
            ? `Analytics and statements for ${instituteName(scope)}.`
            : "Analytics, ledgers and exportable statements across all institutes."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportLink href={`/api/reports/export?${qs({ tab, format: "csv" })}`} label="CSV" />
            <ExportLink href={`/api/reports/export?${qs({ tab, format: "xlsx" })}`} label="Excel" />
            <ExportLink href={`/api/reports/export?${qs({ tab, format: "pdf" })}`} label="PDF" />
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1 border-b border-[var(--color-border)]">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/reports?${qs({ tab: t.key })}`}
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

      {instituteOptions.length > 0 && <InstituteFilter institutes={instituteOptions} />}

      {tab === "daily" && <Daily payments={payments} showInstitute={showInstitute} />}
      {tab === "monthly" && <Monthly payments={payments} showInstitute={showInstitute} />}
      {tab === "student" && <StudentSummary assignments={assignments} showInstitute={showInstitute} />}
      {tab === "pending" && <Pending assignments={assignments} showInstitute={showInstitute} />}
      {tab === "expense" && <ExpenseSummary expenses={expenses} showInstitute={showInstitute} />}
      {tab === "cashbook" && <Ledger accounts={accounts} txns={txns} type="CASH" showInstitute={showInstitute} />}
      {tab === "bank" && <Ledger accounts={accounts} txns={txns} type="BANK" showInstitute={showInstitute} />}
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

/** Institute column, shown only when the view spans more than one institute. */
function instituteColumn<T extends { instituteId: string }>(show: boolean) {
  return show
    ? [{
        key: "institute",
        header: "Institute",
        render: (r: T) => <span className="text-[var(--color-fg-muted)]">{instituteName(r.instituteId)}</span>,
      }]
    : [];
}

type Payments = ReturnType<typeof scopeByInstitute<import("@/lib/db/store").FeePayment>>;
type Assignments = ReturnType<typeof scopeByInstitute<import("@/lib/db/store").FeeAssignment>>;

/** Collections grouped by period — split per institute when nothing is scoped. */
function periodRows(payments: Payments, showInstitute: boolean, cut: number) {
  const g = groupBy(payments, (p) =>
    showInstitute ? `${p.paidAt.slice(0, cut)}|${p.instituteId}` : p.paidAt.slice(0, cut),
  );
  return Object.entries(g)
    .map(([id, ps]) => ({
      id,
      period: ps[0].paidAt.slice(0, cut),
      instituteId: ps[0].instituteId,
      count: ps.length,
      collectors: collectorsFor(ps),
      total: ps.reduce((s, p) => s + p.amount, 0),
    }))
    .sort((a, b) =>
      b.period.localeCompare(a.period) ||
      instituteName(a.instituteId).localeCompare(instituteName(b.instituteId)),
    );
}

function Daily({ payments, showInstitute }: { payments: Payments; showInstitute: boolean }) {
  const rows = periodRows(payments, showInstitute, 10);
  const total = rows.reduce((s, r) => s + r.total, 0);
  return (
    <>
      <SummaryLine label="Total collected" value={formatCurrency(total)} />
      <DataTable rowKey={(r) => r.id} rows={rows} empty="No collections"
        columns={[
          { key: "day", header: "Date", render: (r) => formatDate(r.period) },
          ...instituteColumn<(typeof rows)[number]>(showInstitute),
          { key: "count", header: "Receipts", render: (r) => r.count },
          { key: "by", header: "Collected by", render: (r) => <Collectors people={r.collectors} /> },
          { key: "total", header: "Amount", render: (r) => <span className="font-semibold">{formatCurrency(r.total)}</span> },
        ]}
      />
    </>
  );
}

function Monthly({ payments, showInstitute }: { payments: Payments; showInstitute: boolean }) {
  const rows = periodRows(payments, showInstitute, 7);
  const total = rows.reduce((s, r) => s + r.total, 0);
  return (
    <>
      <SummaryLine label="Total collected" value={formatCurrency(total)} />
      <DataTable rowKey={(r) => r.id} rows={rows} empty="No collections"
        columns={[
          { key: "month", header: "Month", render: (r) => r.period },
          ...instituteColumn<(typeof rows)[number]>(showInstitute),
          { key: "count", header: "Receipts", render: (r) => r.count },
          { key: "by", header: "Collected by", render: (r) => <Collectors people={r.collectors} /> },
          { key: "total", header: "Amount", render: (r) => <span className="font-semibold">{formatCurrency(r.total)}</span> },
        ]}
      />
    </>
  );
}

function StudentSummary({ assignments, showInstitute }: { assignments: Assignments; showInstitute: boolean }) {
  const byStudent = new Map<string, { paid: number; payable: number; instituteId: string }>();
  assignments.forEach((a) => {
    const cur = byStudent.get(a.studentId) ?? { paid: 0, payable: 0, instituteId: a.instituteId };
    cur.payable += a.totalPayable; cur.paid += a.totalPaid;
    byStudent.set(a.studentId, cur);
  });
  const rows = Array.from(byStudent.entries()).map(([sid, v]) => {
    const s = store.students.get(sid);
    return {
      id: sid,
      instituteId: v.instituteId,
      name: s?.name ?? sid,
      adm: s?.admissionNo ?? "",
      payable: v.payable,
      paid: v.paid,
      balance: v.payable - v.paid,
    };
  }).sort((a, b) => b.balance - a.balance);
  return (
    <DataTable rowKey={(r) => r.id} rows={rows} empty="No students"
      columns={[
        ...instituteColumn<(typeof rows)[number]>(showInstitute),
        { key: "adm", header: "Admission #", render: (r) => <span className="font-mono text-xs">{r.adm}</span> },
        { key: "name", header: "Student", render: (r) => <span className="font-medium">{r.name}</span> },
        { key: "payable", header: "Payable", render: (r) => formatCurrency(r.payable) },
        { key: "paid", header: "Paid", render: (r) => <span className="text-emerald-600">{formatCurrency(r.paid)}</span> },
        { key: "bal", header: "Balance", render: (r) => <span className="text-amber-600 font-semibold">{formatCurrency(r.balance)}</span> },
      ]}
    />
  );
}

function Pending({ assignments, showInstitute }: { assignments: Assignments; showInstitute: boolean }) {
  const rows = assignments
    .filter((a) => a.status !== "PAID")
    .map((a) => {
      const s = store.students.get(a.studentId);
      const cls = s ? store.classes.get(s.classId) : undefined;
      return {
        id: a.id,
        instituteId: a.instituteId,
        name: s?.name ?? "",
        adm: s?.admissionNo ?? "",
        cls: cls?.name ?? "",
        balance: a.totalPayable - a.totalPaid,
        status: a.status,
      };
    })
    .sort((a, b) => b.balance - a.balance);
  const total = rows.reduce((s, r) => s + r.balance, 0);
  return (
    <>
      <SummaryLine label="Total outstanding" value={formatCurrency(total)} />
      <DataTable rowKey={(r) => r.id} rows={rows} empty="Nothing pending — great!"
        columns={[
          ...instituteColumn<(typeof rows)[number]>(showInstitute),
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

function ExpenseSummary({
  expenses, showInstitute,
}: {
  expenses: ReturnType<typeof scopeByInstitute<import("@/lib/db/store").Expense>>;
  showInstitute: boolean;
}) {
  const g = groupBy(expenses, (e) => (showInstitute ? `${e.categoryId}|${e.instituteId}` : e.categoryId));
  const rows = Object.entries(g).map(([id, es]) => ({
    id,
    instituteId: es[0].instituteId,
    category: store.expenseCategories.get(es[0].categoryId)?.name ?? "—",
    count: es.length,
    total: es.reduce((s, e) => s + e.amount, 0),
  })).sort((a, b) => b.total - a.total);
  const total = rows.reduce((s, r) => s + r.total, 0);
  return (
    <>
      <SummaryLine label="Total expenses" value={formatCurrency(total)} />
      <DataTable rowKey={(r) => r.id} rows={rows} empty="No expenses"
        columns={[
          ...instituteColumn<(typeof rows)[number]>(showInstitute),
          { key: "cat", header: "Category", render: (r) => <span className="font-medium">{r.category}</span> },
          { key: "count", header: "Vouchers", render: (r) => r.count },
          { key: "total", header: "Amount", render: (r) => <span className="font-semibold">{formatCurrency(r.total)}</span> },
        ]}
      />
    </>
  );
}

function Ledger({
  accounts, txns, type, showInstitute,
}: {
  accounts: ReturnType<typeof scopeByInstitute<import("@/lib/db/store").Account>>;
  txns: ReturnType<typeof scopeByInstitute<import("@/lib/db/store").Transaction>>;
  type: "BANK" | "CASH";
  showInstitute: boolean;
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
          ...instituteColumn<(typeof rows)[number]>(showInstitute),
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

function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--color-border-strong)] px-3 text-sm font-medium hover:bg-[var(--color-surface-2)]"
    >
      <Download className="h-4 w-4" /> {label}
    </Link>
  );
}
