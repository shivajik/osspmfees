import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { store, scopeByInstitute } from "@/lib/db/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Wallet, ReceiptText, GraduationCap, Landmark, Building2, TrendingUp, AlertTriangle } from "lucide-react";

export default async function DashboardPage() {
  const user = await requireUser();
  const scope = user.instituteId;
  const students = scopeByInstitute(store.students.values(), scope);
  const institutes = Array.from(store.institutes.values());
  const audits = store.auditLogs.slice(0, 6);

  const stats = [
    { label: "Today's collection", value: formatCurrency(148500), hint: "12 receipts", icon: ReceiptText, tone: "brand" as const },
    { label: "Monthly collection", value: formatCurrency(2340000), hint: "+18% vs last month", icon: TrendingUp, tone: "success" as const },
    { label: "Today's expenses", value: formatCurrency(24800), hint: "6 vouchers", icon: Wallet, tone: "warning" as const },
    { label: "Pending fees", value: formatCurrency(985000), hint: "132 students", icon: AlertTriangle, tone: "warning" as const },
    { label: "Bank balance", value: formatCurrency(5720000), hint: "3 accounts", icon: Landmark, tone: "info" as const },
    { label: "Cash balance", value: formatCurrency(148500), hint: "In hand", icon: Wallet, tone: "brand" as const },
    { label: "Students", value: String(students.length || 0), hint: user.instituteId ? "Active" : "Across all institutes", icon: GraduationCap, tone: "info" as const },
    { label: "Institutes", value: String(institutes.length), hint: "Managed tenants", icon: Building2, tone: "brand" as const },
  ];

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
              <CardDescription>Last 14 days — cash vs bank</CardDescription>
            </div>
            <Badge tone="success">+18.2%</Badge>
          </CardHeader>
          <MiniTrend />
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>System-wide audit stream</CardDescription>
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

function MiniTrend() {
  const bars = [40, 55, 48, 62, 70, 58, 72, 80, 66, 78, 85, 74, 90, 96];
  const max = Math.max(...bars);
  return (
    <div className="mt-2 flex h-40 items-end gap-1.5">
      {bars.map((v, i) => (
        <div key={i} className="flex-1 rounded-t-sm bg-gradient-to-t from-violet-500/70 to-cyan-400/70" style={{ height: `${(v / max) * 100}%` }} />
      ))}
    </div>
  );
}
