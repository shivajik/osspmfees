import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { scopeByInstitute, store } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { NewExpenseButton, NewCategoryButton } from "./_actions";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { parseListParams, paginate } from "@/lib/list-params";

export default async function ExpensesPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.EXPENSE_READ)) redirect("/dashboard");

  const scope = user.instituteId;
  const canWrite = hasPermission(perms, PERMISSIONS.EXPENSE_WRITE) && !!scope;

  const all = scopeByInstitute(store.expenses.values(), scope)
    .sort((a, b) => b.spentAt.localeCompare(a.spentAt));
  const categories = scope ? scopeByInstitute(store.expenseCategories.values(), scope) : [];
  const accounts = scope ? scopeByInstitute(store.accounts.values(), scope) : [];

  const sp = await searchParams;
  const params = parseListParams(sp, { filterKeys: ["categoryId", "mode", "status"] });
  const q = params.q.toLowerCase();
  const filtered = all.filter((r) => {
    if (params.filters.categoryId && r.categoryId !== params.filters.categoryId) return false;
    if (params.filters.mode && r.mode !== params.filters.mode) return false;
    if (params.filters.status && r.status !== params.filters.status) return false;
    if (!q) return true;
    return (
      r.description.toLowerCase().includes(q) ||
      r.voucherNo.toLowerCase().includes(q)
    );
  });
  const page = paginate(filtered, params.page, params.pageSize);

  const monthKey = new Date().toISOString().slice(0, 7);
  const monthlyTotal = all.filter((r) => r.spentAt.slice(0, 7) === monthKey).reduce((s, r) => s + r.amount, 0);
  const totalAll = all.reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Vouchers, categories, and expense reporting."
        actions={
          canWrite ? (
            <div className="flex gap-2">
              <NewCategoryButton />
              <NewExpenseButton
                categories={categories.map((c) => ({ id: c.id, name: c.name }))}
                accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
              />
            </div>
          ) : null
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card><CardHeader><div><CardTitle>This month</CardTitle><CardDescription>{monthKey}</CardDescription></div></CardHeader><p className="text-2xl font-semibold">{formatCurrency(monthlyTotal)}</p></Card>
        <Card><CardHeader><div><CardTitle>All time</CardTitle><CardDescription>Total booked</CardDescription></div></CardHeader><p className="text-2xl font-semibold">{formatCurrency(totalAll)}</p></Card>
        <Card><CardHeader><div><CardTitle>Categories</CardTitle><CardDescription>Chart of accounts</CardDescription></div></CardHeader><p className="text-2xl font-semibold">{categories.length}</p></Card>
      </div>

      <ListToolbar
        placeholder="Search by description or voucher #…"
        filters={[
          { key: "categoryId", label: "Category", options: categories.map((c) => ({ value: c.id, label: c.name })) },
          { key: "mode", label: "Mode", options: ["CASH","BANK","CARD","UPI","CHEQUE","ONLINE"].map((m) => ({ value: m, label: m })) },
          { key: "status", label: "Status", options: [{ value: "PAID", label: "Paid" }, { value: "DRAFT", label: "Draft" }, { value: "APPROVED", label: "Approved" }] },
        ]}
      />
      <DataTable
        rowKey={(r) => r.id}
        rows={page.rows}
        empty="No expenses match your filters"
        columns={[
          { key: "voucher", header: "Voucher", render: (r) => <span className="font-mono text-xs">{r.voucherNo}</span> },
          { key: "date", header: "Date", render: (r) => formatDate(r.spentAt) },
          { key: "desc", header: "Description", render: (r) => (
            <div><div className="font-medium">{r.description}</div>
            <div className="text-xs text-[var(--color-fg-muted)]">{store.expenseCategories.get(r.categoryId)?.name ?? "—"}</div></div>
          )},
          { key: "mode", header: "Mode", render: (r) => <Badge tone="neutral">{r.mode}</Badge> },
          { key: "acc", header: "Account", render: (r) => r.accountId ? store.accounts.get(r.accountId)?.name ?? "—" : "—" },
          { key: "amount", header: "Amount", render: (r) => <span className="font-semibold">{formatCurrency(r.amount)}</span> },
          { key: "status", header: "Status", render: (r) => <Badge tone={r.status === "PAID" ? "success" : "warning"}>{r.status}</Badge> },
        ]}
      />
      <Pagination page={page.page} totalPages={page.totalPages} total={page.total} pageSize={page.pageSize} />
    </>
  );
}
