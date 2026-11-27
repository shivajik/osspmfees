import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { assignmentBalance, scopeByInstitute, store } from "@/lib/db/store";
import { formatCurrency } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { NewClassButton } from "./_actions";
import { DeleteButton } from "@/components/delete-button";
import { compareClassNames, normalizeClassName } from "@/lib/academics";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { parseListParams, paginate } from "@/lib/list-params";

export default async function ClassesPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.CLASS_READ)) redirect("/dashboard");

  const scoped = scopeByInstitute(store.classes.values(), user.instituteId);
  const canWrite = hasPermission(perms, PERMISSIONS.CLASS_WRITE) && !!user.instituteId;
  const studentsByClass = new Map<string, number>();
  for (const s of store.students.values()) {
    studentsByClass.set(s.classId, (studentsByClass.get(s.classId) ?? 0) + 1);
  }

  // Fee totals per class, from each student's assignments.
  const feesByClass = new Map<string, { payable: number; received: number; pending: number; pendingStudents: Set<string> }>();
  for (const a of scopeByInstitute(store.feeAssignments.values(), user.instituteId)) {
    const st = store.students.get(a.studentId);
    if (!st) continue;
    const f = feesByClass.get(st.classId) ?? { payable: 0, received: 0, pending: 0, pendingStudents: new Set<string>() };
    f.payable += a.totalPayable; f.received += a.totalPaid;
    const bal = assignmentBalance(a);
    f.pending += bal;
    if (bal > 0) f.pendingStudents.add(a.studentId);
    feesByClass.set(st.classId, f);
  }
  const divisionsByClass = new Map<string, number>();
  for (const b of store.batches.values()) divisionsByClass.set(b.classId, (divisionsByClass.get(b.classId) ?? 0) + 1);

  // Institute admins see their own classes (deduped by id). Super admins see one
  // row per institute so it is clear which institute each class belongs to.
  type Totals = { students: number; divisions: number; payable: number; received: number; pending: number; pendingStudents: number };
  const merged = new Map<string, { row: (typeof scoped)[number] } & Totals>();
  for (const r of scoped) {
    const key = user.instituteId ? r.id : `${r.instituteId}::${normalizeClassName(r.name)}`;
    const existing = merged.get(key);
    const f = feesByClass.get(r.id);
    const add: Totals = {
      students: studentsByClass.get(r.id) ?? 0,
      divisions: divisionsByClass.get(r.id) ?? 0,
      payable: f?.payable ?? 0, received: f?.received ?? 0, pending: f?.pending ?? 0,
      pendingStudents: f?.pendingStudents.size ?? 0,
    };
    if (existing) {
      for (const k of Object.keys(add) as (keyof Totals)[]) existing[k] += add[k];
    } else merged.set(key, { row: r, ...add });
  }
  const instituteName = (id: string) => store.institutes.get(id)?.name ?? "—";
  const instituteOptions = user.instituteId ? [] : Array.from(store.institutes.values()).map((i) => ({ id: i.id, name: i.name }));
  const sorted = Array.from(merged.values()).sort((a, b) => {
    if (!user.instituteId) {
      const byInst = instituteName(a.row.instituteId).localeCompare(instituteName(b.row.instituteId));
      if (byInst !== 0) return byInst;
    }
    return compareClassNames(a.row.name, b.row.name);
  });

  const sp = await searchParams;
  const params = parseListParams(sp, { filterKeys: user.instituteId ? ["students", "dues"] : ["instituteId", "students", "dues"] });
  const q = params.q.toLowerCase();
  const filtered = sorted.filter((r) => {
    if (params.filters.instituteId && r.row.instituteId !== params.filters.instituteId) return false;
    if (params.filters.students === "with" && r.students === 0) return false;
    if (params.filters.students === "empty" && r.students > 0) return false;
    if (params.filters.dues === "pending" && r.pending <= 0) return false;
    if (params.filters.dues === "clear" && r.pending > 0) return false;
    if (!q) return true;
    return normalizeClassName(r.row.name).toLowerCase().includes(q) || (r.row.code ?? "").toLowerCase().includes(q);
  });
  const page = paginate(filtered, params.page, params.pageSize);

  return (
    <>
      <PageHeader
        title="Classes"
        description="Grade/standard definitions for this institute."
        actions={canWrite ? <NewClassButton /> : null}
      />
      <ListToolbar
        placeholder="Search by class name or code…"
        filters={[
          ...(user.instituteId ? [] : [{ key: "instituteId", label: "Institute", options: instituteOptions.map((i) => ({ value: i.id, label: i.name })) }]),
          { key: "students", label: "Students", options: [{ value: "with", label: "Has students" }, { value: "empty", label: "No students" }] },
          { key: "dues", label: "Fees", options: [{ value: "pending", label: "Fees pending" }, { value: "clear", label: "No dues" }] },
        ]}
      />
      <DataTable
        rowKey={(r) => r.row.id}
        rows={page.rows}
        empty="No classes match your filters"
        columns={[
          ...(user.instituteId ? [] : [{
            key: "institute",
            header: "Institute",
            render: (r: (typeof sorted)[number]) => instituteName(r.row.instituteId),
          }]),
          { key: "name", header: "Class", render: (r) => <span className="font-medium">{normalizeClassName(r.row.name)}</span> },
          { key: "code", header: "Code", render: (r) => <span className="font-mono text-xs">{r.row.code ?? "—"}</span> },
          { key: "students", header: "Students", render: (r) => r.students },
          { key: "div", header: "Divisions", render: (r) => r.divisions || "—" },
          { key: "payable", header: "Payable", render: (r) => formatCurrency(r.payable) },
          { key: "received", header: "Received", render: (r) => <span className="text-emerald-600">{formatCurrency(r.received)}</span> },
          { key: "pending", header: "Pending", render: (r) => r.pending > 0 ? (
            <div>
              <div className="font-semibold text-amber-600">{formatCurrency(r.pending)}</div>
              <div className="text-xs text-[var(--color-fg-muted)]">{r.pendingStudents} student{r.pendingStudents === 1 ? "" : "s"}</div>
            </div>
          ) : <span className="text-[var(--color-fg-subtle)]">—</span> },
          { key: "actions", header: "", render: (r) => canWrite ? (
            <div className="flex justify-end">
              <DeleteButton kind="class" id={r.row.id} label={normalizeClassName(r.row.name)} what="class" />
            </div>
          ) : null },
        ]}
      />
      <Pagination page={page.page} totalPages={page.totalPages} total={page.total} pageSize={page.pageSize} />
    </>
  );
}
