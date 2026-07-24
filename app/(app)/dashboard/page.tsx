import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CollectionChart } from "@/components/collection-chart";
import { store, scopeByInstitute } from "@/lib/db/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Wallet, ReceiptText, GraduationCap, Landmark, Building2, TrendingUp, AlertTriangle, Users } from "lucide-react";

export default async function DashboardPage() {
  const user = await requireUser();
  const scope = user.instituteId;
  const students = scopeByInstitute(store.students.values(), scope);
  const institutes = Array.from(store.institutes.values());
  const audits = store.auditLogs.slice(0, 8);
  const payments = scopeByInstitute(store.feePayments.values(), scope);
  const expenses = scopeByInstitute(store.expenses.values(), scope);
  const assignments = scopeByInstitute(store.feeAssignments.values(), scope);
  const accounts = scopeByInstitute(store.accounts.values(), scope);

  const today = new Date().toISOString().slice(0, 10);
  const monthKey = today.slice(0, 7);
  const todayCollection = payments.filter((p) => p.paidAt.slice(0, 10) === today).reduce((s, p) => s + p.amount, 0);
  const monthlyCollection = payments.filter((p) => p.paidAt.slice(0, 7) === monthKey).reduce((s, p) => s + p.amount, 0);
  const todayExpense = expenses.filter((e) => e.spentAt.slice(0, 10) === today).reduce((s, e) => s + e.amount, 0);
  const pending = assignments.reduce((s, a) => s + (a.totalPayable - a.totalPaid), 0);
  const pendingStudents = new Set(assignments.filter((a) => a.status !== "PAID").map((a) => a.studentId)).size;
  const bankBal = accounts.filter((a) => a.type === "BANK").reduce((s, a) => s + a.currentBal, 0);
  const cashBal = accounts.filter((a) => a.type === "CASH").reduce((s, a) => s + a.currentBal, 0);

  const stats = [
    { label: "Today's collection", value: formatCurrency(todayCollection), hint: `${payments.filter((p) => p.paidAt.slice(0, 10) === today).length} receipts`, icon: ReceiptText, tone: "brand" as const },
    { label: "Monthly collection", value: formatCurrency(monthlyCollection), hint: monthKey, icon: TrendingUp, tone: "success" as const },
    { label: "Today's expenses", value: formatCurrency(todayExpense), hint: `${expenses.filter((e) => e.spentAt.slice(0, 10) === today).length} vouchers`, icon: Wallet, tone: "warning" as const },
    { label: "Pending fees", value: formatCurrency(pending), hint: `${pendingStudents} students`, icon: AlertTriangle, tone: "warning" as const },
    { label: "Bank balance", value: formatCurrency(bankBal), hint: `${accounts.filter((a) => a.type === "BANK").length} accounts`, icon: Landmark, tone: "info" as const },
    { label: "Cash balance", value: formatCurrency(cashBal), hint: "In hand", icon: Wallet, tone: "brand" as const },
    { label: "Students", value: String(students.length), hint: user.instituteId ? "Active" : "Across all institutes", icon: GraduationCap, tone: "info" as const },
    { label: user.instituteId ? "Users" : "Institutes", value: String(user.instituteId ? Array.from(store.users.values()).filter((u) => u.instituteId === user.instituteId).length : institutes.length), hint: user.instituteId ? "In institute" : "Managed tenants", icon: user.instituteId ? Users : Building2, tone: "brand" as const },
  ];

  const trend = last14Days(payments);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        description="Here's a snapshot of today's activity across your institute."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Collection trend</CardTitle>
              <CardDescription>Last 14 days — fee receipts</CardDescription>
            </div>
            <Badge tone="success">{formatCurrency(trend.reduce((s, v) => s + v.value, 0))}</Badge>
          </CardHeader>
          <CollectionChart data={trend} />
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>Audit stream</CardDescription>
            </div>
          </CardHeader>
          {audits.length === 0 ? (
            <p className="text-xs text-[var(--color-fg-muted)]">No activity yet.</p>
          ) : (
            <ul className="space-y-2">
              {audits.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 text-xs">
                  <div>
                    <p className="font-medium text-[var(--color-fg)]">{a.action}</p>
                    <p className="text-[var(--color-fg-subtle)]">{a.actorEmail}</p>
                  </div>
                  <span className="whitespace-nowrap text-[var(--color-fg-subtle)]">{formatDate(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function last14Days(payments: { paidAt: string; amount: number }[]) {
  const days: { label: string; value: number }[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const value = payments.filter((p) => p.paidAt.slice(0, 10) === key).reduce((s, p) => s + p.amount, 0);
    days.push({ label: key.slice(5), value });
  }
  return days;
}

