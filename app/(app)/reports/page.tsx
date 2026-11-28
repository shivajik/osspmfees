import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { assignmentYearId, scopeByInstitute, store, isActivePayment } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Download } from "lucide-react";
import { DateParam, InstituteFilter, ParamFilter } from "./_filters";
import { receiptRows, todayIST } from "@/lib/reports/receipts";
import {
  classRows, compareClassNames, filterAssignments, headRows, studentHeadRows,
  type StudentHeadRow,
} from "@/lib/reports/fee-heads";

/** Tabs built from fee assignments — these honour the class / year filters. */
const FEE_TABS: Tab[] = ["classwise", "student", "headwise", "pending", "discount"];

type Tab = "daily" | "receipts" | "monthly" | "classwise" | "student" | "headwise" | "pending" | "discount" | "expense" | "cashbook" | "bank";

const TABS: { key: Tab; label: string; needs?: string }[] = [
  { key: "daily", label: "Daily collection" },
  { key: "receipts", label: "Daily detailed (receipts)" },
  { key: "monthly", label: "Monthly collection" },
  { key: "classwise", label: "Class-wise" },
  { key: "student", label: "Student-wise" },
  { key: "headwise", label: "Fee head-wise" },
  { key: "pending", label: "Pending fees" },
  { key: "discount", label: "Discounts" },
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

  const payments = scopeByInstitute(store.feePayments.values(), scope).filter(isActivePayment);
  const expenses = scopeByInstitute(store.expenses.values(), scope);
  const classId = pick("classId");
  const yearId = pick("yearId");
  const assignments = filterAssignments(scopeByInstitute(store.feeAssignments.values(), scope), { classId, yearId });
  const classOptions = scopeByInstitute(store.classes.values(), scope)
    .map((c) => ({ id: c.id, name: showInstituteName(c.instituteId, c.name, !scope) }))
    .sort((a, b) => compareClassNames(a.name, b.name));
  const yearOptions = scopeByInstitute(store.academicYears.values(), scope)
    .map((y) => ({ id: y.id, name: showInstituteName(y.instituteId, y.name, !scope) }))
    .sort((a, b) => b.name.localeCompare(a.name));
  const feeTab = FEE_TABS.includes(tab);
  // Receipt-wise report: defaults to today when no dates are picked.
  const from = /^\d{4}-\d{2}-\d{2}$/.test(pick("from")) ? pick("from") : todayIST();
  const to = /^\d{4}-\d{2}-\d{2}$/.test(pick("to")) ? pick("to") : from;
  const txns = scopeByInstitute(store.transactions.values(), scope);
  const accounts = scopeByInstitute(store.accounts.values(), scope);

  const qs = (extra: Record<string, string>) =>
    new URLSearchParams({
      ...(chosen ? { instituteId: chosen } : {}),
      ...(classId ? { classId } : {}),
      ...(yearId ? { yearId } : {}),
      ...(tab === "receipts" || extra.tab === "receipts" ? { from, to } : {}),
      ...extra,
    }).toString();

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
      {tab === "receipts" && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <DateParam param="from" label="From" value={from} />
          <DateParam param="to" label="To" value={to} />
          <ParamFilter param="classId" allLabel="Class: All" options={classOptions} />
        </div>
      )}
      {feeTab && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <ParamFilter param="classId" allLabel="Class: All" options={classOptions} />
          <ParamFilter param="yearId" allLabel="Academic year: All" options={yearOptions} />
        </div>
      )}

      {tab === "daily" && <Daily payments={payments} showInstitute={showInstitute} />}
      {tab === "receipts" && <Receipts scope={scope} from={from} to={to} classId={classId} showInstitute={showInstitute} />}
      {tab === "monthly" && <Monthly payments={payments} showInstitute={showInstitute} />}
      {tab === "classwise" && <ClassWise assignments={assignments} showInstitute={showInstitute} />}
      {tab === "student" && <StudentWise assignments={assignments} showInstitute={showInstitute} />}
      {tab === "headwise" && <HeadWise assignments={assignments} />}
      {tab === "pending" && <Pending assignments={assignments} showInstitute={showInstitute} />}
      {tab === "discount" && <Discounts assignments={assignments} payments={payments} showInstitute={showInstitute} />}
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

/** Every receipt in the date range — who paid, receipt no., heads, mode, collector. */
function Receipts({ scope, from, to, classId, showInstitute }: {
  scope: string | null; from: string; to: string; classId: string; showInstitute: boolean;
}) {
  const rows = receiptRows(scope, from, to, classId);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byMode = Object.entries(groupBy(rows, (r) => r.mode))
    .map(([m, rs]) => `${m}: ${formatCurrency(rs.reduce((s, r) => s + r.amount, 0))}`)
    .join(" · ");
  return (
    <>
      <Card className="mb-4">
        <CardHeader>
          <div>
            <CardTitle>Total collected</CardTitle>
            <CardDescription>
              {from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`} · {rows.length} receipt{rows.length === 1 ? "" : "s"}{byMode ? ` · ${byMode}` : ""}
            </CardDescription>
          </div>
        </CardHeader>
        <p className="text-3xl font-semibold">{formatCurrency(total)}</p>
      </Card>
      <DataTable rowKey={(r) => r.id} rows={rows} empty="No receipts on these dates"
        columns={[
          { key: "date", header: "Date", render: (r) => <span className="whitespace-nowrap">{formatDate(r.date)}</span> },
          ...instituteColumn<(typeof rows)[number]>(showInstitute),
          { key: "rcp", header: "Receipt #", render: (r) => (
            <Link href={`/fees/receipts/${r.id}`} className="font-mono text-xs text-[var(--color-brand)] hover:underline">{r.receiptNo}</Link>
          )},
          { key: "student", header: "Student", render: (r) => (
            <div><div className="font-medium">{r.student}</div><div className="text-xs text-[var(--color-fg-muted)]">{[r.adm, r.className].filter(Boolean).join(" · ")}</div></div>
          ), footer: "Total" },
          { key: "heads", header: "Fee heads", render: (r) => <span className="text-xs">{r.heads}</span> },
          { key: "mode", header: "Mode", render: (r) => <Badge tone="info">{r.mode}</Badge> },
          { key: "disc", header: "Discount", render: (r) => (r.discount ? formatCurrency(r.discount) : <span className="text-[var(--color-fg-subtle)]">—</span>), footer: formatCurrency(rows.reduce((s, r) => s + r.discount, 0)) },
          { key: "amt", header: "Amount", render: (r) => <span className="font-semibold">{formatCurrency(r.amount)}</span>, footer: formatCurrency(total) },
          { key: "by", header: "Collected by", render: (r) => <span className="text-xs">{r.collectedBy}</span> },
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

const showInstituteName = (instituteId: string, name: string, withInstitute: boolean) =>
  withInstitute ? `${name} — ${instituteName(instituteId)}` : name;

const money = (v: number) => (v ? formatCurrency(v) : <span className="text-[var(--color-fg-subtle)]">—</span>);
const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);

/** Head breakdown as compact "Head: ₹x" lines. */
function HeadList({ byHead }: { byHead: Record<string, number> }) {
  const items = Object.entries(byHead).filter(([, v]) => v > 0);
  if (!items.length) return <span className="text-[var(--color-fg-subtle)]">—</span>;
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      {items.map(([h, v]) => (
        <div key={h}><span className="text-[var(--color-fg-muted)]">{h}:</span> {formatCurrency(v)}</div>
      ))}
    </div>
  );
}

function ClassWise({ assignments, showInstitute }: { assignments: Assignments; showInstitute: boolean }) {
  const { rows: students } = studentHeadRows(assignments);
  const rows = classRows(students, showInstitute);
  return (
    <>
      <SummaryLine label="Total outstanding" value={formatCurrency(sum(rows, (r) => r.balance))} />
      <DataTable rowKey={(r) => r.id} rows={rows} empty="No fees assigned"
        columns={[
          ...instituteColumn<(typeof rows)[number]>(showInstitute),
          { key: "cls", header: "Class", render: (r) => <span className="font-medium">{r.className}</span>, footer: "Total" },
          { key: "st", header: "Students", render: (r) => r.students, footer: sum(rows, (r) => r.students) },
          { key: "pst", header: "With dues", render: (r) => r.pendingStudents, footer: sum(rows, (r) => r.pendingStudents) },
          { key: "pay", header: "Payable", render: (r) => formatCurrency(r.payable), footer: formatCurrency(sum(rows, (r) => r.payable)) },
          { key: "rec", header: "Received", render: (r) => <span className="text-emerald-600">{formatCurrency(r.received)}</span>, footer: formatCurrency(sum(rows, (r) => r.received)) },
          { key: "bal", header: "Balance", render: (r) => <span className="font-semibold text-amber-600">{formatCurrency(r.balance)}</span>, footer: formatCurrency(sum(rows, (r) => r.balance)) },
          { key: "heads", header: "Pending by head", render: (r) => <HeadList byHead={r.pendingByHead} /> },
        ]}
      />
    </>
  );
}

/** Register-style sheet: one row per student, one column per fee head received. */
function StudentWise({ assignments, showInstitute }: { assignments: Assignments; showInstitute: boolean }) {
  const { heads, rows } = studentHeadRows(assignments);
  const receivedHeads = heads.filter((h) => rows.some((r) => r.receivedByHead[h]));
  const numbered = rows.map((r, i) => ({ ...r, sr: i + 1 }));
  return (
    <>
      <p className="mb-2 text-xs text-[var(--color-fg-muted)]">Head columns show the amount received against each fee head.</p>
      <DataTable rowKey={(r) => r.id} rows={numbered} empty="No students"
        columns={[
          { key: "sr", header: "Sr", render: (r) => r.sr },
          ...instituteColumn<(typeof numbered)[number]>(showInstitute),
          { key: "cls", header: "Class", render: (r) => r.className },
          { key: "name", header: "Student", render: (r) => (
            <div><div className="font-medium">{r.name}</div><div className="font-mono text-xs text-[var(--color-fg-muted)]">{r.adm}</div></div>
          ), footer: "Total" },
          { key: "pay", header: "Payable", render: (r) => formatCurrency(r.payable), footer: formatCurrency(sum(rows, (r) => r.payable)) },
          ...receivedHeads.map((h) => ({
            key: `h:${h}`, header: h,
            render: (r: StudentHeadRow) => money(r.receivedByHead[h] ?? 0),
            footer: formatCurrency(sum(rows, (r) => r.receivedByHead[h] ?? 0)),
          })),
          { key: "rec", header: "Received", render: (r) => <span className="text-emerald-600">{formatCurrency(r.received)}</span>, footer: formatCurrency(sum(rows, (r) => r.received)) },
          { key: "bal", header: "Balance", render: (r) => <span className="font-semibold text-amber-600">{formatCurrency(r.balance)}</span>, footer: formatCurrency(sum(rows, (r) => r.balance)) },
        ]}
      />
    </>
  );
}

function HeadWise({ assignments }: { assignments: Assignments }) {
  const { heads, rows: students } = studentHeadRows(assignments);
  const rows = headRows(heads, students);
  return (
    <>
      <SummaryLine label="Pending across all heads" value={formatCurrency(sum(rows, (r) => r.pending))} />
      <DataTable rowKey={(r) => r.head} rows={rows} empty="No fee heads"
        columns={[
          { key: "head", header: "Fee head", render: (r) => <span className="font-medium">{r.head}</span>, footer: "Total" },
          { key: "chg", header: "Charged", render: (r) => money(r.charged), footer: formatCurrency(sum(rows, (r) => r.charged)) },
          { key: "rec", header: "Received", render: (r) => <span className="text-emerald-600">{money(r.received)}</span>, footer: formatCurrency(sum(rows, (r) => r.received)) },
          { key: "pend", header: "Pending", render: (r) => <span className="font-semibold text-amber-600">{money(r.pending)}</span>, footer: formatCurrency(sum(rows, (r) => r.pending)) },
          { key: "st", header: "Students pending", render: (r) => r.students || "—" },
        ]}
      />
      <p className="mt-2 text-xs text-[var(--color-fg-muted)]">
        Charged is before discounts. &quot;Unallocated&quot; is money received on receipts that were not split by head.
      </p>
    </>
  );
}

/** Students with dues, grouped class by class with the heads still owed. */
function Pending({ assignments, showInstitute }: { assignments: Assignments; showInstitute: boolean }) {
  const { rows: all } = studentHeadRows(assignments);
  const rows = all.filter((r) => r.balance > 0);
  const classes = classRows(rows, showInstitute);
  const total = sum(rows, (r) => r.balance);
  return (
    <>
      <SummaryLine label="Total outstanding" value={formatCurrency(total)} />
      {rows.length === 0 && (
        <p className="py-16 text-center text-sm text-[var(--color-fg-muted)]">Nothing pending — great!</p>
      )}
      <div className="flex flex-col gap-6">
        {classes
          .sort((x, y) => (showInstitute ? instituteName(x.instituteId).localeCompare(instituteName(y.instituteId)) : 0) || compareClassNames(x.className, y.className))
          .map((c, i, arr) => {
          const list = rows.filter((r) => (showInstitute ? `${r.classId}|${r.instituteId}` : r.classId) === c.id);
          // School name once, as a heading above its first class.
          const firstOfSchool = showInstitute && (i === 0 || arr[i - 1].instituteId !== c.instituteId);
          const school = classes.filter((x) => x.instituteId === c.instituteId);
          return (
            <section key={c.id}>
              {firstOfSchool && (
                <h2 className="mb-3 mt-4 flex flex-wrap items-baseline gap-x-3 border-b border-[var(--color-border)] pb-2 text-lg font-semibold">
                  {instituteName(c.instituteId)}
                  <span className="text-sm font-normal text-[var(--color-fg-muted)]">
                    {formatCurrency(sum(school, (x) => x.balance))} pending
                  </span>
                </h2>
              )}
              <h3 className="mb-2 flex flex-wrap items-baseline gap-x-3 text-sm font-semibold">
                {c.className}
                <span className="text-xs font-normal text-[var(--color-fg-muted)]">
                  {list.length} student{list.length === 1 ? "" : "s"} · {formatCurrency(c.balance)} pending
                </span>
              </h3>
              <DataTable rowKey={(r) => r.id} rows={list} empty="—"
                columns={[
                  { key: "adm", header: "Admission #", render: (r) => <span className="font-mono text-xs">{r.adm}</span> },
                  { key: "name", header: "Student", render: (r) => <span className="font-medium">{r.name}</span>, footer: "Class total" },
                  { key: "pay", header: "Payable", render: (r) => formatCurrency(r.payable), footer: formatCurrency(c.payable) },
                  { key: "rec", header: "Received", render: (r) => formatCurrency(r.received), footer: formatCurrency(c.received) },
                  { key: "bal", header: "Balance", render: (r) => <span className="font-semibold text-amber-600">{formatCurrency(r.balance)}</span>, footer: formatCurrency(c.balance) },
                  { key: "heads", header: "Pending heads", render: (r) => <HeadList byHead={r.pendingByHead} /> },
                ]}
              />
            </section>
          );
        })}
      </div>
    </>
  );
}


/**
 * Every concession granted, from both places one can be given: a flat discount
 * on the assignment, and a counter discount recorded on a receipt.
 */
function Discounts({
  assignments, payments, showInstitute,
}: {
  assignments: Assignments;
  payments: Payments;
  showInstitute: boolean;
}) {
  const counterByAssignment = new Map<string, typeof payments>();
  payments.forEach((p) => {
    if (!p.discount) return;
    const list = counterByAssignment.get(p.assignmentId) ?? [];
    list.push(p);
    counterByAssignment.set(p.assignmentId, list);
  });

  const rows = assignments
    .map((a) => {
      const counterPayments = counterByAssignment.get(a.id) ?? [];
      const counter = counterPayments.reduce((sum, p) => sum + (p.discount ?? 0), 0);
      const total = a.discount + counter;
      if (total <= 0) return null;

      const s = store.students.get(a.studentId);
      const approvers = new Map<string, string>();
      const addApprover = (name?: string, id?: string) => {
        if (!name || approvers.has(name)) return;
        approvers.set(name, (id ? store.users.get(id)?.role : "") ?? "");
      };
      if (a.discount > 0) addApprover(a.discountByName, a.discountBy);
      counterPayments.forEach((p) => addApprover(p.discountByName, p.discountBy));

      const reasons = Array.from(new Set([
        a.discount > 0 ? a.discountReason : "",
        ...counterPayments.map((p) => p.discountReason ?? ""),
      ].filter(Boolean))) as string[];

      return {
        id: a.id,
        instituteId: a.instituteId,
        name: s?.name ?? "—",
        adm: s?.admissionNo ?? "",
        cls: s ? store.classes.get(s.classId)?.name ?? "" : "",
        year: store.academicYears.get(assignmentYearId(a))?.name ?? "—",
        structure: a.discount,
        counter,
        total,
        approvers: Array.from(approvers, ([name, role]) => ({ name, role })),
        reasons,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.total - a.total);

  const total = rows.reduce((sum, r) => sum + r.total, 0);
  const students = new Set(rows.map((r) => `${r.adm}|${r.instituteId}`)).size;

  return (
    <>
      <Card className="mb-4">
        <CardHeader>
          <div>
            <CardTitle>Total discount given</CardTitle>
            <CardDescription>{students} student{students === 1 ? "" : "s"} · {rows.length} assignment{rows.length === 1 ? "" : "s"}</CardDescription>
          </div>
        </CardHeader>
        <p className="text-3xl font-semibold text-sky-600">{formatCurrency(total)}</p>
      </Card>
      <DataTable rowKey={(r) => r.id} rows={rows} empty="No discounts given"
        columns={[
          ...instituteColumn<(typeof rows)[number]>(showInstitute),
          { key: "adm", header: "Admission #", render: (r) => <span className="font-mono text-xs">{r.adm}</span> },
          { key: "name", header: "Student", render: (r) => (
            <div>
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-[var(--color-fg-muted)]">{[r.cls, r.year].filter(Boolean).join(" · ")}</div>
            </div>
          )},
          { key: "struct", header: "On assignment", render: (r) => r.structure > 0 ? formatCurrency(r.structure) : <span className="text-[var(--color-fg-subtle)]">—</span> },
          { key: "counter", header: "At counter", render: (r) => r.counter > 0 ? formatCurrency(r.counter) : <span className="text-[var(--color-fg-subtle)]">—</span> },
          { key: "total", header: "Total discount", render: (r) => <span className="font-semibold text-sky-600">{formatCurrency(r.total)}</span> },
          { key: "by", header: "Approved by", render: (r) => <Collectors people={r.approvers} /> },
          { key: "why", header: "Reason", render: (r) => (
            r.reasons.length ? <span className="text-xs">{r.reasons.join(" · ")}</span> : <span className="text-[var(--color-fg-subtle)]">—</span>
          )},
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
