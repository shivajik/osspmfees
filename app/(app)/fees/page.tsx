import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { scopeByInstitute, store } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AssignFeesButton, CollectFeeButton, NewStructureButton } from "./_actions";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { parseListParams, paginate } from "@/lib/list-params";

export default async function FeesPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.FEE_READ)) redirect("/dashboard");

  const sp = await searchParams;
  const params = parseListParams(sp, { filterKeys: ["status"] });

  const scope = user.instituteId;
  const canCollect = hasPermission(perms, PERMISSIONS.FEE_COLLECT) && !!scope;
  const canWriteStructure = hasPermission(perms, PERMISSIONS.FEE_STRUCTURE_WRITE) && !!scope;

  const allAssignments = scopeByInstitute(store.feeAssignments.values(), scope);
  const q = params.q.toLowerCase();
  const assignments = allAssignments.filter((a) => {
    if (params.filters.status && a.status !== params.filters.status) return false;
    if (!q) return true;
    const s = store.students.get(a.studentId);
    return (
      (s?.name ?? "").toLowerCase().includes(q) ||
      (s?.admissionNo ?? "").toLowerCase().includes(q)
    );
  });
  const pageData = paginate(assignments, params.page, params.pageSize);
  const structures = scopeByInstitute(store.feeStructures.values(), scope);
  const payments = scopeByInstitute(store.feePayments.values(), scope)
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
    .slice(0, 10);
  const accounts = scope ? scopeByInstitute(store.accounts.values(), scope) : [];
  const classes = scope ? scopeByInstitute(store.classes.values(), scope) : [];
  const years = scope ? scopeByInstitute(store.academicYears.values(), scope) : [];

  const totalPayable = assignments.reduce((s, a) => s + a.totalPayable, 0);
  const totalPaid = assignments.reduce((s, a) => s + a.totalPaid, 0);
  const totalOutstanding = totalPayable - totalPaid;

  return (
    <>
      <PageHeader
        title="Fee collection"
        description="Assignments, partial payments, and receipts for the current academic year."
        actions={
          <div className="flex gap-2">
            {canWriteStructure && (
              <AssignFeesButton
                structures={structures.map((fs) => ({
                  id: fs.id,
                  name: fs.name,
                  className: store.classes.get(fs.classId)?.name ?? "—",
                  yearName: store.academicYears.get(fs.academicYearId)?.name ?? "—",
                  totalAmount: fs.totalAmount,
                }))}
              />
            )}
            {canWriteStructure && (
              <NewStructureButton
                classes={classes.map((c) => ({ id: c.id, name: c.name }))}
                years={years.map((y) => ({ id: y.id, name: y.name }))}
              />
            )}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader><div><CardTitle>Total payable</CardTitle><CardDescription>All active assignments</CardDescription></div></CardHeader>
          <p className="text-2xl font-semibold">{formatCurrency(totalPayable)}</p>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Collected</CardTitle><CardDescription>Received to date</CardDescription></div></CardHeader>
          <p className="text-2xl font-semibold text-emerald-600">{formatCurrency(totalPaid)}</p>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Outstanding</CardTitle><CardDescription>Yet to collect</CardDescription></div></CardHeader>
          <p className="text-2xl font-semibold text-amber-600">{formatCurrency(totalOutstanding)}</p>
        </Card>
      </div>

      {allAssignments.length === 0 && (
        <Card className="mb-6">
          <CardHeader><div><CardTitle>How fee collection works</CardTitle><CardDescription>Three steps before you can collect a payment</CardDescription></div></CardHeader>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--color-fg-muted)]">
            <li><span className="font-medium text-[var(--color-fg)]">Create a fee structure</span> for a class + academic year (Institute Admin).</li>
            <li><span className="font-medium text-[var(--color-fg)]">Assign fees</span> to students with the “Assign fees” button — this creates one assignment per active student (Institute Admin).</li>
            <li><span className="font-medium text-[var(--color-fg)]">Collect</span> full or partial payments from the Assignments table below (Institute Admin, Accountant, Cashier).</li>
          </ol>
        </Card>
      )}

      <div className="mb-2 text-sm font-medium">Assignments</div>
      <ListToolbar
        placeholder="Search by student name or admission #…"
        filters={[{
          key: "status", label: "Status",
          options: [
            { value: "PENDING", label: "Pending" },
            { value: "PARTIAL", label: "Partial" },
            { value: "PAID", label: "Paid" },
          ],
        }]}
      />
      <DataTable
        rowKey={(r) => r.id}
        rows={pageData.rows}
        empty="No fee assignments match your filters"
        columns={[
          { key: "stu", header: "Student", render: (r) => {
            const s = store.students.get(r.studentId);
            return <div><div className="font-medium">{s?.name ?? "—"}</div><div className="text-xs text-[var(--color-fg-muted)] font-mono">{s?.admissionNo}</div></div>;
          }},
          { key: "class", header: "Class", render: (r) => {
            const s = store.students.get(r.studentId);
            return s ? store.classes.get(s.classId)?.name ?? "—" : "—";
          }},
          { key: "fs", header: "Structure", render: (r) => store.feeStructures.get(r.feeStructureId)?.name ?? "—" },
          { key: "payable", header: "Payable", render: (r) => <span className="font-medium">{formatCurrency(r.totalPayable)}</span> },
          { key: "paid", header: "Paid", render: (r) => <span className="text-emerald-600">{formatCurrency(r.totalPaid)}</span> },
          { key: "bal", header: "Balance", render: (r) => <span className="text-amber-600 font-medium">{formatCurrency(r.totalPayable - r.totalPaid)}</span> },
          { key: "status", header: "Status", render: (r) => (
            <Badge tone={r.status === "PAID" ? "success" : r.status === "PARTIAL" ? "info" : "warning"}>{r.status}</Badge>
          )},
          { key: "action", header: "", render: (r) => (
            canCollect && r.status !== "PAID" ? (
              <CollectFeeButton
                assignmentId={r.id}
                studentName={store.students.get(r.studentId)?.name ?? ""}
                balance={r.totalPayable - r.totalPaid}
                accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
              />
            ) : null
          )},
        ]}
      />
      <Pagination page={pageData.page} totalPages={pageData.totalPages} total={pageData.total} pageSize={pageData.pageSize} />

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>Recent receipts</CardTitle><CardDescription>Last 10 payments</CardDescription></div></CardHeader>
          {payments.length === 0 ? (
            <p className="text-xs text-[var(--color-fg-muted)]">No payments yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)] text-sm">
              {payments.map((p) => {
                const s = store.students.get(p.studentId);
                return (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <div>
                      <Link href={`/fees/receipts/${p.id}`} className="font-medium text-[var(--color-brand)] hover:underline">{p.receiptNo}</Link>
                      <div className="text-xs text-[var(--color-fg-muted)]">{s?.name} · {p.mode}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatCurrency(p.amount)}</div>
                      <div className="text-xs text-[var(--color-fg-subtle)]">{formatDate(p.paidAt)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Fee structures</CardTitle><CardDescription>Class-level fee templates</CardDescription></div></CardHeader>
          {structures.length === 0 ? (
            <p className="text-xs text-[var(--color-fg-muted)]">No structures defined.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)] text-sm">
              {structures.map((fs) => (
                <li key={fs.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium">{fs.name}</div>
                    <div className="text-xs text-[var(--color-fg-muted)]">{store.classes.get(fs.classId)?.name} · {fs.items.length} heads</div>
                  </div>
                  <div className="font-semibold">{formatCurrency(fs.totalAmount)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
