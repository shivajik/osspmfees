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

export default async function ExpensesPage() {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.EXPENSE_READ)) redirect("/dashboard");

  const scope = user.instituteId;
  const canWrite = hasPermission(perms, PERMISSIONS.EXPENSE_WRITE) && !!scope;

  const rows = scopeByInstitute(store.expenses.values(), scope)
    .sort((a, b) => b.spentAt.localeCompare(a.spentAt));
  const categories = scope ? scopeByInstitute(store.expenseCategories.values(), scope) : [];
  const accounts = scope ? scopeByInstitute(store.accounts.values(), scope) : [];

  const monthKey = new Date().toISOString().slice(0, 7);
  const monthlyTotal = rows.filter((r) => r.spentAt.slice(0, 7) === monthKey).reduce((s, r) => s + r.amount, 0);
  const totalAll = rows.reduce((s, r) => s + r.amount, 0);

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

      <DataTable
        rowKey={(r) => r.id}
        rows={rows}
        empty="No expenses booked yet"
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
    </>
  );
}
