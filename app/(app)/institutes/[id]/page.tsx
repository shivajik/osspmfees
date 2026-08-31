import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, GraduationCap, Landmark, ReceiptText, TrendingUp, Users, Wallet, AlertTriangle } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/rbac";
import { store, scopeByInstitute, grossPayable, assignmentBalance } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DeleteInstituteButton, EditInstituteButton } from "../_actions";

export default async function InstituteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user.role !== ROLES.SUPER_ADMIN) redirect("/dashboard");

  const { id } = await params;
  const institute = store.institutes.get(id);
  if (!institute) notFound();

  const students = scopeByInstitute(store.students.values(), id);
  const activeStudents = students.filter((s) => s.status === "ACTIVE");
  const users = Array.from(store.users.values()).filter((u) => u.instituteId === id);
  const classes = scopeByInstitute(store.classes.values(), id);
  const years = scopeByInstitute(store.academicYears.values(), id);
  const activeYear = years.find((y) => y.isActive);
  const payments = scopeByInstitute(store.feePayments.values(), id);
  const expenses = scopeByInstitute(store.expenses.values(), id);
  const assignments = scopeByInstitute(store.feeAssignments.values(), id);
  const accounts = scopeByInstitute(store.accounts.values(), id);
  const audits = store.auditLogs.filter((a) => a.instituteId === id).slice(0, 8);

  const monthKey = new Date().toISOString().slice(0, 7);
  const monthlyCollection = payments.filter((p) => p.paidAt.slice(0, 7) === monthKey).reduce((s, p) => s + p.amount, 0);
  const monthlyExpense = expenses.filter((e) => e.spentAt.slice(0, 7) === monthKey).reduce((s, e) => s + e.amount, 0);
  const pending = assignments.reduce((s, a) => s + assignmentBalance(a), 0);
  const pendingStudents = new Set(assignments.filter((a) => assignmentBalance(a) > 0).map((a) => a.studentId)).size;
  const bankBal = accounts.filter((a) => a.type === "BANK").reduce((s, a) => s + a.currentBal, 0);
  const cashBal = accounts.filter((a) => a.type === "CASH").reduce((s, a) => s + a.currentBal, 0);
  const totalPayable = assignments.reduce((s, a) => s + grossPayable(a), 0);

  const stats = [
    { label: "Students", value: String(students.length), hint: `${activeStudents.length} active`, icon: GraduationCap, tone: "info" as const },
    { label: "Users", value: String(users.length), hint: "Admins, accountants, cashiers", icon: Users, tone: "brand" as const },
    { label: "This month's collection", value: formatCurrency(monthlyCollection), hint: monthKey, icon: TrendingUp, tone: "success" as const },
    { label: "This month's expenses", value: formatCurrency(monthlyExpense), hint: monthKey, icon: Wallet, tone: "warning" as const },
    { label: "Pending fees", value: formatCurrency(pending), hint: `${pendingStudents} students`, icon: AlertTriangle, tone: "warning" as const },
    { label: "Bank balance", value: formatCurrency(bankBal), hint: `${accounts.filter((a) => a.type === "BANK").length} accounts`, icon: Landmark, tone: "info" as const },
    { label: "Cash balance", value: formatCurrency(cashBal), hint: "In hand", icon: Wallet, tone: "brand" as const },
    { label: "Total fees payable", value: formatCurrency(totalPayable), hint: activeYear?.name ?? "No active year", icon: ReceiptText, tone: "brand" as const },
  ];

  const quickLinks = [
    { href: `/students?instituteId=${id}`, label: "Students" },
    { href: `/users?instituteId=${id}`, label: "Users" },
    { href: `/classes?instituteId=${id}`, label: "Classes" },
    { href: `/batches?instituteId=${id}`, label: "Divisions" },
    { href: `/academic-years?instituteId=${id}`, label: "Academic years" },
    { href: `/fees?instituteId=${id}`, label: "Fees" },
    { href: `/expenses?instituteId=${id}`, label: "Expenses" },
    { href: `/accounts?instituteId=${id}`, label: "Bank & cash" },
  ];

  return (
    <>
      <Link href="/institutes" className="mb-3 inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
        <ArrowLeft className="h-3.5 w-3.5" />Back to institutes
      </Link>
      <PageHeader
        title={institute.name}
        description={`Code ${institute.code} · Created ${formatDate(institute.createdAt)}`}
        actions={
          <div className="flex items-center gap-1">
            <EditInstituteButton institute={{ id: institute.id, name: institute.name, code: institute.code, email: institute.email, phone: institute.phone, address: institute.address, status: institute.status }} />
            <DeleteInstituteButton institute={{ id: institute.id, name: institute.name, code: institute.code }} redirectTo="/institutes" />
          </div>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[var(--color-fg-muted)]" />
            <div>
              <CardTitle>Institute details</CardTitle>
              <CardDescription>Contact information and status</CardDescription>
            </div>
          </div>
          <Badge tone={institute.status === "ACTIVE" ? "success" : "warning"}>{institute.status}</Badge>
        </CardHeader>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs text-[var(--color-fg-subtle)]">Address</p><p>{institute.address ?? "—"}</p></div>
          <div><p className="text-xs text-[var(--color-fg-subtle)]">Phone</p><p>{institute.phone ?? "—"}</p></div>
          <div><p className="text-xs text-[var(--color-fg-subtle)]">Email</p><p>{institute.email ?? "—"}</p></div>
          <div><p className="text-xs text-[var(--color-fg-subtle)]">Active year</p><p>{activeYear?.name ?? "—"}</p></div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Browse this institute</CardTitle>
              <CardDescription>Jump straight to its filtered records</CardDescription>
            </div>
          </CardHeader>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {quickLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-md border border-[var(--color-border)] px-3 py-2 text-center text-xs font-medium text-[var(--color-fg-muted)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
              >
                {l.label}
              </Link>
            ))}
          </div>
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

      <div className="mt-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Classes</CardTitle>
              <CardDescription>{classes.length} defined</CardDescription>
            </div>
          </CardHeader>
          {classes.length === 0 ? (
            <p className="text-xs text-[var(--color-fg-muted)]">No classes yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {classes.map((c) => <Badge key={c.id} tone="neutral">{c.name}</Badge>)}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
