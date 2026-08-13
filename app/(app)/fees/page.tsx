import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import {
  scopeByInstitute, store, assignmentYearId, grossPayable, assignmentBalance,
} from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  AssignFeesButton, CollectFeeButton, NewStructureButton,
  EditAssignmentButton, EditStructureButton, EditPaymentButton,
} from "./_actions";
import Link from "next/link";
import { DeleteButton } from "@/components/delete-button";
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
  const params = parseListParams(sp, { filterKeys: ["status", "academicYearId"] });

  const scope = user.instituteId;
  const canCollect = hasPermission(perms, PERMISSIONS.FEE_COLLECT) && !!scope;
  const canWriteStructure = hasPermission(perms, PERMISSIONS.FEE_STRUCTURE_WRITE) && !!scope;

  const allAssignments = scopeByInstitute(store.feeAssignments.values(), scope);
  const q = params.q.toLowerCase();
  const assignments = allAssignments.filter((a) => {
    if (params.filters.status && a.status !== params.filters.status) return false;
    if (params.filters.academicYearId && assignmentYearId(a) !== params.filters.academicYearId) return false;
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
  const classOptions = classes.map((c) => ({ id: c.id, name: c.name }));
  const yearOptions = years.map((y) => ({ id: y.id, name: y.name }));
  const studentOptions = (scope ? scopeByInstitute(store.students.values(), scope) : [])
    .filter((s) => s.status === "ACTIVE")
    .map((s) => ({
      id: s.id,
      name: s.name,
      admissionNo: s.admissionNo,
      className: store.classes.get(s.classId)?.name ?? "—",
    }));

  const totalPayable = assignments.reduce((s, a) => s + grossPayable(a), 0);
  const totalPaid = assignments.reduce((s, a) => s + a.totalPaid, 0);
  const totalPrevious = assignments.reduce((s, a) => s + (a.previousBalance ?? 0), 0);
  const totalDiscount = assignments.reduce((s, a) => s + a.discount, 0);
  const totalOutstanding = assignments.reduce((s, a) => s + assignmentBalance(a), 0);

  return (
    <>
      <PageHeader
        title="Fee collection"
        description="Year-wise assignments with carried-forward previous balances, discounts and receipts."
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
                students={studentOptions}
              />
            )}
            {canWriteStructure && (
              <NewStructureButton classes={classOptions} years={yearOptions} />
            )}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader><div><CardTitle>Total payable</CardTitle><CardDescription>Incl. previous balance</CardDescription></div></CardHeader>
          <p className="text-2xl font-semibold">{formatCurrency(totalPayable)}</p>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Previous balance</CardTitle><CardDescription>Carried forward</CardDescription></div></CardHeader>
          <p className="text-2xl font-semibold text-orange-600">{formatCurrency(totalPrevious)}</p>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Discount</CardTitle><CardDescription>Concessions given</CardDescription></div></CardHeader>
          <p className="text-2xl font-semibold text-sky-600">{formatCurrency(totalDiscount)}</p>
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
            <li><span className="font-medium text-[var(--color-fg)]">Assign fees</span> to students — unpaid dues from earlier years are carried forward automatically.</li>
            <li><span className="font-medium text-[var(--color-fg)]">Collect</span> full or partial payments from the Assignments table below.</li>
          </ol>
          {canWriteStructure && (
            <div className="mt-4">
              <AssignFeesButton
                label="Step 2 — Assign fees to students"
                structures={structures.map((fs) => ({
                  id: fs.id,
                  name: fs.name,
                  className: store.classes.get(fs.classId)?.name ?? "—",
                  yearName: store.academicYears.get(fs.academicYearId)?.name ?? "—",
                  totalAmount: fs.totalAmount,
                }))}
                students={studentOptions}
              />
            </div>
          )}
        </Card>
      )}

      <div className="mb-2 text-sm font-medium">Assignments</div>
      <ListToolbar
        placeholder="Search by student name or admission #…"
        filters={[
          {
            key: "academicYearId", label: "Academic year",
            options: yearOptions.map((y) => ({ value: y.id, label: y.name })),
          },
          {
            key: "status", label: "Status",
            options: [
              { value: "PENDING", label: "Pending" },
              { value: "PARTIAL", label: "Partial" },
              { value: "PAID", label: "Paid" },
            ],
          },
        ]}
      />
      <DataTable
        rowKey={(r) => r.id}
        rows={pageData.rows}
        empty="No fee assignments match your filters"
        columns={[
          { key: "stu", header: "Student", render: (r) => {
            const s = store.students.get(r.studentId);
            return (
              <div>
                <Link href={`/fees/students/${r.studentId}`} className="font-medium text-[var(--color-brand)] hover:underline">
                  {s?.name ?? "—"}
                </Link>
                <div className="text-xs text-[var(--color-fg-muted)] font-mono">{s?.admissionNo}</div>
              </div>
            );
          }},
          { key: "year", header: "Year", render: (r) => store.academicYears.get(assignmentYearId(r))?.name ?? "—" },
          { key: "fs", header: "Structure", render: (r) => store.feeStructures.get(r.feeStructureId)?.name ?? "—" },
          { key: "prev", header: "Previous balance", render: (r) => (
            <span className={(r.previousBalance ?? 0) > 0 ? "font-medium text-orange-600" : "text-[var(--color-fg-subtle)]"}>
              {formatCurrency(r.previousBalance ?? 0)}
            </span>
          )},
          { key: "disc", header: "Discount", render: (r) => (
            r.discount > 0 ? (
              <div>
                <div className="font-medium text-sky-600">− {formatCurrency(r.discount)}</div>
                <div className="text-xs text-[var(--color-fg-muted)]">
                  by {r.discountByName ?? "—"}{r.discountReason ? ` · ${r.discountReason}` : ""}
                </div>
              </div>
            ) : <span className="text-[var(--color-fg-subtle)]">—</span>
          )},
          { key: "payable", header: "Total due", render: (r) => (
            <div>
              <div className="font-medium">{formatCurrency(grossPayable(r))}</div>
              <div className="text-xs text-[var(--color-fg-muted)]">This year {formatCurrency(r.totalPayable)}</div>
            </div>
          )},
          { key: "paid", header: "Paid", render: (r) => <span className="text-emerald-600">{formatCurrency(r.totalPaid)}</span> },
          { key: "bal", header: "Balance", render: (r) => <span className="text-amber-600 font-medium">{formatCurrency(assignmentBalance(r))}</span> },
          { key: "status", header: "Status", render: (r) => (
            r.carriedForwardTo
              ? <Badge tone="neutral">CARRIED FORWARD</Badge>
              : <Badge tone={r.status === "PAID" ? "success" : r.status === "PARTIAL" ? "info" : "warning"}>{r.status}</Badge>
          )},
          { key: "action", header: "", render: (r) => (
            <div className="flex items-center justify-end gap-1">
              {canWriteStructure && (
                <EditAssignmentButton
                  assignment={{
                    id: r.id,
                    studentName: store.students.get(r.studentId)?.name ?? "",
                    structureTotal: store.feeStructures.get(r.feeStructureId)?.totalAmount ?? r.totalPayable + r.discount,
                    discount: r.discount,
                    discountReason: r.discountReason,
                    discountByName: r.discountByName,
                    previousBalance: r.previousBalance ?? 0,
                    totalPaid: r.totalPaid,
                  }}
                />
              )}
              {canCollect && r.status !== "PAID" && !r.carriedForwardTo ? (
                <CollectFeeButton
                  assignmentId={r.id}
                  studentName={store.students.get(r.studentId)?.name ?? ""}
                  balance={assignmentBalance(r)}
                  previousDue={Math.max(0, (r.previousBalance ?? 0) - r.totalPaid)}
                  accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
                />
              ) : null}
              {canWriteStructure && (
                <DeleteButton
                  kind="feeAssignment" id={r.id}
                  label={`${store.students.get(r.studentId)?.name ?? "assignment"} — ${store.feeStructures.get(r.feeStructureId)?.name ?? ""}`}
                  what="fee assignment"
                />
              )}
            </div>
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
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                    <div>
                      <Link href={`/fees/receipts/${p.id}`} className="font-medium text-[var(--color-brand)] hover:underline">{p.receiptNo}</Link>
                      <div className="text-xs text-[var(--color-fg-muted)]">
                        {s?.name} · {p.mode}{p.cheque ? ` · cheque #${p.cheque.chequeNo}` : ""}
                      </div>
                      {(p.appliedToPrevious ?? 0) > 0 && (
                        <div className="text-xs text-orange-600">{formatCurrency(p.appliedToPrevious ?? 0)} adjusted to previous balance</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="font-semibold">{formatCurrency(p.amount)}</div>
                        <div className="text-xs text-[var(--color-fg-subtle)]">{formatDate(p.paidAt)}</div>
                      </div>
                      {canCollect && (
                        <EditPaymentButton
                          payment={{ id: p.id, receiptNo: p.receiptNo, amount: p.amount, mode: p.mode, reference: p.reference, cheque: p.cheque }}
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
          <CardHeader><div><CardTitle>Fee structures</CardTitle><CardDescription>Class-level fee templates</CardDescription></div></CardHeader>
          {structures.length === 0 ? (
            <p className="text-xs text-[var(--color-fg-muted)]">No structures defined.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)] text-sm">
              {structures.map((fs) => (
                <li key={fs.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <div className="font-medium">{fs.name}</div>
                    <div className="text-xs text-[var(--color-fg-muted)]">
                      {store.classes.get(fs.classId)?.name} · {store.academicYears.get(fs.academicYearId)?.name} · {fs.items.length} heads
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="font-semibold">{formatCurrency(fs.totalAmount)}</div>
                    {canWriteStructure && (
                      <EditStructureButton
                        structure={{
                          id: fs.id, name: fs.name, totalAmount: fs.totalAmount,
                          classId: fs.classId, academicYearId: fs.academicYearId, items: fs.items,
                        }}
                        classes={classOptions}
                        years={yearOptions}
                      />
                    )}
                    {canWriteStructure && (
                      <DeleteButton kind="feeStructure" id={fs.id} label={fs.name} what="fee structure" />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
