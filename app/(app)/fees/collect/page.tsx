import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { scopeByInstitute, store } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ListToolbar } from "@/components/list-toolbar";
import { CollectFeeButton } from "../_actions";
import { ArrowLeft, ReceiptText } from "lucide-react";

export default async function CollectCounterPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.FEE_COLLECT)) redirect("/fees");
  const scope = user.instituteId;
  if (!scope) redirect("/fees");

  const sp = await searchParams;
  const pick = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const classId = pick("classId");
  const studentId = pick("studentId");
  const q = pick("q").toLowerCase();

  const classes = scopeByInstitute(store.classes.values(), scope);
  const students = scopeByInstitute(store.students.values(), scope).filter((s) => s.status === "ACTIVE");
  const assignments = scopeByInstitute(store.feeAssignments.values(), scope);
  const accounts = scopeByInstitute(store.accounts.values(), scope).map((a) => ({ id: a.id, name: a.name, type: a.type }));

  const dueByStudent = new Map<string, number>();
  for (const a of assignments) {
    const bal = a.totalPayable - a.totalPaid;
    if (bal > 0) dueByStudent.set(a.studentId, (dueByStudent.get(a.studentId) ?? 0) + bal);
  }

  const selectedClass = classId ? classes.find((c) => c.id === classId) ?? null : null;
  const selectedStudent = studentId ? students.find((s) => s.id === studentId) ?? null : null;

  const classStudents = selectedClass
    ? students
        .filter((s) => s.classId === selectedClass.id)
        .filter((s) =>
          !q || s.name.toLowerCase().includes(q) || s.admissionNo.toLowerCase().includes(q),
        )
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const studentAssignments = selectedStudent
    ? assignments.filter((a) => a.studentId === selectedStudent.id)
    : [];
  const studentPayments = selectedStudent
    ? scopeByInstitute(store.feePayments.values(), scope)
        .filter((p) => p.studentId === selectedStudent.id)
        .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
        .slice(0, 5)
    : [];

  const step = selectedStudent ? 3 : selectedClass ? 2 : 1;

  return (
    <>
      <PageHeader
        title="Collection counter"
        description="Pick a class, choose a student, and collect their pending fees in a few clicks."
        actions={
          <Link
            href="/fees"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--color-border-strong)] px-3 text-sm text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"
          >
            <ReceiptText className="h-4 w-4" />All assignments
          </Link>
        }
      />

      {/* Steps */}
      <ol className="mb-6 flex flex-wrap items-center gap-2 text-xs">
        {["Select class", "Select student", "Collect payment"].map((label, i) => {
          const n = i + 1;
          const state = step === n ? "active" : step > n ? "done" : "todo";
          return (
            <li
              key={label}
              className={
                "flex items-center gap-2 rounded-full border px-3 py-1 " +
                (state === "active"
                  ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)] font-medium"
                  : state === "done"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-[var(--color-border)] text-[var(--color-fg-subtle)]")
              }
            >
              <span className="font-semibold">{n}</span>
              {label}
            </li>
          );
        })}
      </ol>

      {/* Step 1 — class */}
      {!selectedClass && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Select a class</CardTitle>
              <CardDescription>Students with pending balance are counted per class.</CardDescription>
            </div>
          </CardHeader>
          {classes.length === 0 ? (
            <p className="text-sm text-[var(--color-fg-muted)]">No classes created yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {classes.map((c) => {
                const inClass = students.filter((s) => s.classId === c.id);
                const pending = inClass.filter((s) => (dueByStudent.get(s.id) ?? 0) > 0).length;
                return (
                  <Link
                    key={c.id}
                    href={`/fees/collect?classId=${c.id}`}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-colors hover:border-[var(--color-brand)] hover:bg-[var(--color-brand-soft)]"
                  >
                    <div className="text-sm font-semibold">{c.name}</div>
                    <div className="mt-1 text-xs text-[var(--color-fg-muted)]">{inClass.length} students</div>
                    <div className="mt-2 text-xs font-medium text-amber-600">{pending} with dues</div>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Step 2 — student */}
      {selectedClass && !selectedStudent && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{selectedClass.name} — select a student</CardTitle>
              <CardDescription>Search by name or admission number.</CardDescription>
            </div>
            <Link href="/fees/collect" className="inline-flex items-center gap-1 text-xs text-[var(--color-brand)] hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" />Change class
            </Link>
          </CardHeader>
          <ListToolbar placeholder="Search student name or admission #…" />
          {classStudents.length === 0 ? (
            <p className="text-sm text-[var(--color-fg-muted)]">No students match.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {classStudents.map((s) => {
                const due = dueByStudent.get(s.id) ?? 0;
                return (
                  <li key={s.id}>
                    <Link
                      href={`/fees/collect?classId=${selectedClass.id}&studentId=${s.id}`}
                      className="flex items-center justify-between gap-3 px-1 py-3 text-sm hover:bg-[var(--color-surface-2)]"
                    >
                      <div>
                        <div className="font-medium">{s.name}</div>
                        <div className="font-mono text-xs text-[var(--color-fg-muted)]">{s.admissionNo}</div>
                      </div>
                      {due > 0 ? (
                        <span className="font-semibold text-amber-600">{formatCurrency(due)} due</span>
                      ) : (
                        <Badge tone="success">No dues</Badge>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {/* Step 3 — collect */}
      {selectedStudent && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>{selectedStudent.name}</CardTitle>
                <CardDescription>
                  {selectedStudent.admissionNo} · {selectedClass?.name ?? store.classes.get(selectedStudent.classId)?.name ?? "—"}
                </CardDescription>
              </div>
              <Link
                href={`/fees/collect?classId=${selectedStudent.classId}`}
                className="inline-flex items-center gap-1 text-xs text-[var(--color-brand)] hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" />Change student
              </Link>
            </CardHeader>

            {studentAssignments.length === 0 ? (
              <p className="text-sm text-[var(--color-fg-muted)]">
                No fee assignment for this student yet. An Institute Admin must assign a fee structure first.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {studentAssignments.map((a) => {
                  const balance = a.totalPayable - a.totalPaid;
                  return (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{store.feeStructures.get(a.feeStructureId)?.name ?? "Fee"}</div>
                        <div className="text-xs text-[var(--color-fg-muted)]">
                          Payable {formatCurrency(a.totalPayable)} · Paid {formatCurrency(a.totalPaid)}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className={`text-sm font-semibold ${balance > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                            {formatCurrency(balance)}
                          </div>
                          <Badge tone={a.status === "PAID" ? "success" : a.status === "PARTIAL" ? "info" : "warning"}>{a.status}</Badge>
                        </div>
                        {balance > 0 && (
                          <CollectFeeButton
                            assignmentId={a.id}
                            studentName={selectedStudent.name}
                            balance={balance}
                            accounts={accounts}
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Total outstanding</CardTitle>
                <CardDescription>Across all assignments</CardDescription>
              </div>
            </CardHeader>
            <p className="text-2xl font-semibold text-amber-600">
              {formatCurrency(dueByStudent.get(selectedStudent.id) ?? 0)}
            </p>
            <div className="mt-5 text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">Recent receipts</div>
            {studentPayments.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--color-fg-muted)]">No payments yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--color-border)] text-sm">
                {studentPayments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <div>
                      <Link href={`/fees/receipts/${p.id}`} className="font-medium text-[var(--color-brand)] hover:underline">
                        {p.receiptNo}
                      </Link>
                      <div className="text-xs text-[var(--color-fg-muted)]">{formatDate(p.paidAt)} · {p.mode}</div>
                    </div>
                    <span className="font-semibold">{formatCurrency(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
