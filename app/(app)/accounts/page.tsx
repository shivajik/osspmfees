import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, ROLES, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { scopeByInstitute, store } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { NewAccountButton, EditAccountButton } from "./_actions";
import { DeleteButton } from "@/components/delete-button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { parseListParams, paginate } from "@/lib/list-params";

export default async function AccountsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.BANK_READ)) redirect("/dashboard");

  const scope = user.instituteId;
  const isSuper = user.role === ROLES.SUPER_ADMIN;
  const canWrite = hasPermission(perms, PERMISSIONS.BANK_WRITE) && (!!scope || isSuper);

  const allAccounts = scopeByInstitute(store.accounts.values(), scope);
  const allTxns = scopeByInstitute(store.transactions.values(), scope)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const instituteName = (id: string) => store.institutes.get(id)?.name ?? "—";
  const instituteOptions = scope ? [] : Array.from(store.institutes.values()).map((i) => ({ id: i.id, name: i.name }));

  const sp = await searchParams;
  const params = parseListParams(sp, { filterKeys: scope ? ["type"] : ["type", "instituteId"] });
  // Everything the picked institute owns — the headline cards ignore the type
  // and search filters so they always read as that institute's full position.
  const scopedAccounts = params.filters.instituteId
    ? allAccounts.filter((a) => a.instituteId === params.filters.instituteId)
    : allAccounts;
  const q = params.q.toLowerCase();
  const filteredAccounts = allAccounts.filter((a) => {
    if (params.filters.instituteId && a.instituteId !== params.filters.instituteId) return false;
    if (params.filters.type && a.type !== params.filters.type) return false;
    if (!q) return true;
    return a.name.toLowerCase().includes(q) || (a.bankName ?? "").toLowerCase().includes(q) || (a.accountNo ?? "").toLowerCase().includes(q);
  });
  const page = paginate(filteredAccounts, params.page, params.pageSize);
  const txns = allTxns
    .filter((t) => !params.filters.instituteId || t.instituteId === params.filters.instituteId)
    .slice(0, 40);

  const bankAccounts = scopedAccounts.filter((a) => a.type === "BANK");
  const cashAccounts = scopedAccounts.filter((a) => a.type === "CASH");
  const bankTotal = bankAccounts.reduce((s, a) => s + a.currentBal, 0);
  const cashTotal = cashAccounts.reduce((s, a) => s + a.currentBal, 0);
  const openingTotal = scopedAccounts.reduce((s, a) => s + a.openingBal, 0);
  // Totals for the table footer follow every active filter, including type and search.
  const filteredOpening = filteredAccounts.reduce((s, a) => s + a.openingBal, 0);
  const filteredCurrent = filteredAccounts.reduce((s, a) => s + a.currentBal, 0);
  const scopeLabel = params.filters.instituteId
    ? instituteName(params.filters.instituteId)
    : scope ? instituteName(scope) : "All institutes";

  return (
    <>
      <PageHeader
        title="Bank & cash"
        description="Ledgers, balances, and transaction history."
        actions={canWrite ? <NewAccountButton isSuper={isSuper} institutes={instituteOptions} /> : null}
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader><div><CardTitle>Bank balance</CardTitle><CardDescription>{bankAccounts.length} accounts</CardDescription></div></CardHeader><p className="text-2xl font-semibold">{formatCurrency(bankTotal)}</p></Card>
        <Card><CardHeader><div><CardTitle>Cash balance</CardTitle><CardDescription>{cashAccounts.length} accounts</CardDescription></div></CardHeader><p className="text-2xl font-semibold">{formatCurrency(cashTotal)}</p></Card>
        <Card><CardHeader><div><CardTitle>Opening total</CardTitle><CardDescription>{scopeLabel}</CardDescription></div></CardHeader><p className="text-2xl font-semibold">{formatCurrency(openingTotal)}</p></Card>
        <Card><CardHeader><div><CardTitle>Total on hand</CardTitle><CardDescription>Bank + cash · {scopeLabel}</CardDescription></div></CardHeader><p className="text-2xl font-semibold text-emerald-600">{formatCurrency(bankTotal + cashTotal)}</p></Card>
      </div>

      <div className="mb-2 text-sm font-medium">Accounts</div>
      <ListToolbar
        placeholder="Search by name, bank or account #…"
        filters={[
          ...(scope ? [] : [{ key: "instituteId", label: "Institute", options: instituteOptions.map((i) => ({ value: i.id, label: i.name })) }]),
          { key: "type", label: "Type", options: [{ value: "BANK", label: "Bank" }, { value: "CASH", label: "Cash" }] },
        ]}
      />
      <DataTable
        rowKey={(r) => r.id}
        rows={page.rows}
        empty="No accounts match your filters"
        columns={[
          ...(scope ? [] : [{
            key: "institute",
            header: "Institute",
            render: (r: (typeof page.rows)[number]) => instituteName(r.instituteId),
          }]),
          { key: "name", header: "Name", render: (r) => <div><div className="font-medium">{r.name}</div>{r.bankName && <div className="text-xs text-[var(--color-fg-muted)]">{r.bankName}</div>}</div>, footer: `Total · ${filteredAccounts.length} account${filteredAccounts.length === 1 ? "" : "s"}` },
          { key: "type", header: "Type", render: (r) => <Badge tone={r.type === "BANK" ? "info" : "neutral"}>{r.type}</Badge> },
          { key: "acc", header: "Account #", render: (r) => <span className="font-mono text-xs">{r.accountNo ?? "—"}</span> },
          { key: "ifsc", header: "IFSC", render: (r) => <span className="font-mono text-xs">{r.ifsc ?? "—"}</span> },
          { key: "opening", header: "Opening", render: (r) => formatCurrency(r.openingBal), footer: formatCurrency(filteredOpening) },
          { key: "current", header: "Current", render: (r) => <span className="font-semibold">{formatCurrency(r.currentBal)}</span>, footer: <span className="text-emerald-600">{formatCurrency(filteredCurrent)}</span> },
          { key: "actions", header: "", render: (r) => canWrite ? (
            <div className="flex justify-end">
              <EditAccountButton account={{ id: r.id, name: r.name, type: r.type, bankName: r.bankName, accountNo: r.accountNo, ifsc: r.ifsc }} />
              <DeleteButton kind="account" id={r.id} label={r.name} what="account" />
            </div>
          ) : null },
        ]}
      />
      <Pagination page={page.page} totalPages={page.totalPages} total={page.total} pageSize={page.pageSize} />

      <div className="mt-8 mb-2 text-sm font-medium">Recent transactions</div>
      <DataTable
        rowKey={(r) => r.id}
        rows={txns}
        empty="No transactions"
        columns={[
          ...(scope ? [] : [{
            key: "institute",
            header: "Institute",
            render: (r: (typeof txns)[number]) => instituteName(r.instituteId),
          }]),
          { key: "date", header: "Date", render: (r) => formatDate(r.occurredAt) },
          { key: "acc", header: "Account", render: (r) => store.accounts.get(r.accountId)?.name ?? "—" },
          { key: "ref", header: "Reference", render: (r) => <span className="text-xs">{r.reference ?? "—"}</span> },
          { key: "dir", header: "Direction", render: (r) => (
            <Badge tone={r.direction === "CREDIT" ? "success" : "warning"}>{r.direction}</Badge>
          )},
          { key: "amt", header: "Amount", render: (r) => (
            <span className={r.direction === "CREDIT" ? "text-emerald-600 font-semibold" : "text-amber-700 font-semibold"}>
              {r.direction === "CREDIT" ? "+" : "-"}{formatCurrency(r.amount)}
            </span>
          )},
          { key: "bal", header: "Balance", render: (r) => formatCurrency(r.balanceAfter) },
        ]}
      />
    </>
  );
}
