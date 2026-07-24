import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { scopeByInstitute, store } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { NewAccountButton } from "./_actions";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function AccountsPage() {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.BANK_READ)) redirect("/dashboard");

  const scope = user.instituteId;
  const canWrite = hasPermission(perms, PERMISSIONS.BANK_WRITE) && !!scope;

  const accounts = scopeByInstitute(store.accounts.values(), scope);
  const txns = scopeByInstitute(store.transactions.values(), scope)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 40);

  const bankTotal = accounts.filter((a) => a.type === "BANK").reduce((s, a) => s + a.currentBal, 0);
  const cashTotal = accounts.filter((a) => a.type === "CASH").reduce((s, a) => s + a.currentBal, 0);

  return (
    <>
      <PageHeader
        title="Bank & cash"
        description="Ledgers, balances, and transaction history."
        actions={canWrite ? <NewAccountButton /> : null}
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card><CardHeader><div><CardTitle>Bank balance</CardTitle><CardDescription>{accounts.filter((a) => a.type === "BANK").length} accounts</CardDescription></div></CardHeader><p className="text-2xl font-semibold">{formatCurrency(bankTotal)}</p></Card>
        <Card><CardHeader><div><CardTitle>Cash balance</CardTitle><CardDescription>{accounts.filter((a) => a.type === "CASH").length} accounts</CardDescription></div></CardHeader><p className="text-2xl font-semibold">{formatCurrency(cashTotal)}</p></Card>
        <Card><CardHeader><div><CardTitle>Total on hand</CardTitle><CardDescription>Bank + cash</CardDescription></div></CardHeader><p className="text-2xl font-semibold text-emerald-600">{formatCurrency(bankTotal + cashTotal)}</p></Card>
      </div>

      <div className="mb-2 text-sm font-medium">Accounts</div>
      <DataTable
        rowKey={(r) => r.id}
        rows={accounts}
        empty="No accounts yet"
        columns={[
          { key: "name", header: "Name", render: (r) => <div><div className="font-medium">{r.name}</div>{r.bankName && <div className="text-xs text-[var(--color-fg-muted)]">{r.bankName}</div>}</div> },
          { key: "type", header: "Type", render: (r) => <Badge tone={r.type === "BANK" ? "info" : "neutral"}>{r.type}</Badge> },
          { key: "acc", header: "Account #", render: (r) => <span className="font-mono text-xs">{r.accountNo ?? "—"}</span> },
          { key: "ifsc", header: "IFSC", render: (r) => <span className="font-mono text-xs">{r.ifsc ?? "—"}</span> },
          { key: "opening", header: "Opening", render: (r) => formatCurrency(r.openingBal) },
          { key: "current", header: "Current", render: (r) => <span className="font-semibold">{formatCurrency(r.currentBal)}</span> },
        ]}
      />

      <div className="mt-8 mb-2 text-sm font-medium">Recent transactions</div>
      <DataTable
        rowKey={(r) => r.id}
        rows={txns}
        empty="No transactions"
        columns={[
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
