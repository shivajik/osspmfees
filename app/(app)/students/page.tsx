import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { scopeByInstitute, store } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { NewStudentButton } from "./_actions";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { parseListParams, paginate } from "@/lib/list-params";

export default async function StudentsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.STUDENT_READ)) redirect("/dashboard");

  const sp = await searchParams;
  const params = parseListParams(sp, { filterKeys: ["classId", "batchId", "status"] });

  const all = scopeByInstitute(store.students.values(), user.instituteId);
  const canWrite = hasPermission(perms, PERMISSIONS.STUDENT_WRITE) && !!user.instituteId;

  const classes = user.instituteId ? scopeByInstitute(store.classes.values(), user.instituteId) : [];
  const batches = user.instituteId ? scopeByInstitute(store.batches.values(), user.instituteId) : [];
  const years = user.instituteId ? scopeByInstitute(store.academicYears.values(), user.instituteId) : [];

  const q = params.q.toLowerCase();
  const filtered = all.filter((s) => {
    if (params.filters.classId && s.classId !== params.filters.classId) return false;
    if (params.filters.batchId && s.batchId !== params.filters.batchId) return false;
    if (params.filters.status && s.status !== params.filters.status) return false;
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.admissionNo.toLowerCase().includes(q) ||
      (s.guardianName ?? "").toLowerCase().includes(q) ||
      (s.phone ?? "").toLowerCase().includes(q) ||
      (s.email ?? "").toLowerCase().includes(q)
    );
  });

  const page = paginate(filtered, params.page, params.pageSize);

  return (
    <>
      <PageHeader
        title="Students"
        description={user.instituteId ? "Enrollment for your institute." : "All students across institutes."}
        actions={canWrite ? (
          <NewStudentButton
            classes={classes.map((c) => ({ id: c.id, name: c.name }))}
            batches={batches.map((b) => ({ id: b.id, name: b.name, classId: b.classId }))}
            years={years.map((y) => ({ id: y.id, name: y.name }))}
          />
        ) : null}
      />
      <ListToolbar
        placeholder="Search by name, admission #, guardian, phone…"
        filters={[
          { key: "classId", label: "Class", options: classes.map((c) => ({ value: c.id, label: c.name })) },
          { key: "batchId", label: "Batch", options: batches.map((b) => ({ value: b.id, label: b.name })) },
          { key: "status", label: "Status", options: [{ value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Inactive" }] },
        ]}
      />
      <DataTable
        rowKey={(r) => r.id}
        rows={page.rows}
        empty="No students match your filters"
        columns={[
          { key: "adm", header: "Admission #", render: (r) => <span className="font-mono text-xs">{r.admissionNo}</span> },
          { key: "name", header: "Student", render: (r) => (
            <div>
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-[var(--color-fg-muted)]">{r.guardianName ?? "—"}</div>
            </div>
          )},
          { key: "class", header: "Class", render: (r) => store.classes.get(r.classId)?.name ?? "—" },
          { key: "batch", header: "Batch", render: (r) => store.batches.get(r.batchId)?.name ?? "—" },
          { key: "contact", header: "Contact", render: (r) => (
            <div className="text-xs">
              <div>{r.phone ?? "—"}</div>
              <div className="text-[var(--color-fg-subtle)]">{r.email ?? ""}</div>
            </div>
          )},
          { key: "status", header: "Status", render: (r) => (
            <Badge tone={r.status === "ACTIVE" ? "success" : "warning"}>{r.status}</Badge>
          )},
        ]}
      />
      <Pagination page={page.page} totalPages={page.totalPages} total={page.total} pageSize={page.pageSize} />
    </>
  );
}
