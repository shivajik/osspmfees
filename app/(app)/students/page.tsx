import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { scopeByInstitute, store } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EditStudentButton, NewStudentButton } from "./_actions";
import { DeleteButton } from "@/components/delete-button";
import { ImportStudentsButton } from "./_import";
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
  const params = parseListParams(sp, { filterKeys: user.instituteId ? ["classId", "batchId", "status"] : ["instituteId", "classId", "batchId", "status"] });

  const all = scopeByInstitute(store.students.values(), user.instituteId);
  const canWrite = hasPermission(perms, PERMISSIONS.STUDENT_WRITE) && !!user.instituteId;

  // Super admins have no institute scope — build filter options from every institute.
  const classes = user.instituteId ? scopeByInstitute(store.classes.values(), user.instituteId) : Array.from(store.classes.values());
  const batches = user.instituteId ? scopeByInstitute(store.batches.values(), user.instituteId) : Array.from(store.batches.values());
  const years = user.instituteId ? scopeByInstitute(store.academicYears.values(), user.instituteId) : Array.from(store.academicYears.values());
  const instituteName = (id: string) => store.institutes.get(id)?.name ?? "—";
  const optionLabel = (name: string, instituteId: string) =>
    user.instituteId ? name : `${name} — ${instituteName(instituteId)}`;
  const instituteOptions = user.instituteId ? [] : Array.from(store.institutes.values()).map((i) => ({ id: i.id, name: i.name }));

  const q = params.q.toLowerCase();
  const filtered = all.filter((s) => {
    if (params.filters.instituteId && s.instituteId !== params.filters.instituteId) return false;
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
          <div className="flex flex-wrap items-center gap-2">
            <ImportStudentsButton years={years.map((y) => ({ id: y.id, name: y.name }))} />
            <NewStudentButton
              classes={classes.map((c) => ({ id: c.id, name: c.name }))}
              batches={batches.map((b) => ({ id: b.id, name: b.name, classId: b.classId }))}
              years={years.map((y) => ({ id: y.id, name: y.name }))}
            />
          </div>
        ) : null}
      />
      <ListToolbar
        placeholder="Search by name, admission #, guardian, phone…"
        filters={[
          ...(user.instituteId ? [] : [{ key: "instituteId", label: "Institute", options: instituteOptions.map((i) => ({ value: i.id, label: i.name })) }]),
          { key: "classId", label: "Class", options: classes.map((c) => ({ value: c.id, label: optionLabel(c.name, c.instituteId) })) },
          { key: "batchId", label: "Division", options: batches.map((b) => ({ value: b.id, label: optionLabel(b.name, b.instituteId) })) },
          { key: "status", label: "Status", options: [{ value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Inactive" }] },
        ]}
      />
      <DataTable
        rowKey={(r) => r.id}
        rows={page.rows}
        empty="No students match your filters"
        columns={[
          ...(user.instituteId ? [] : [{ key: "institute", header: "Institute", render: (r: (typeof page.rows)[number]) => instituteName(r.instituteId) }]),
          { key: "adm", header: "Admission #", render: (r) => <span className="font-mono text-xs">{r.admissionNo}</span> },
          { key: "name", header: "Student", render: (r) => (
            <div>
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-[var(--color-fg-muted)]">{r.guardianName ?? "—"}</div>
            </div>
          )},
          { key: "class", header: "Class", render: (r) => store.classes.get(r.classId)?.name ?? "—" },
          { key: "batch", header: "Division", render: (r) => store.batches.get(r.batchId)?.name ?? "—" },
          { key: "contact", header: "Contact", render: (r) => (
            <div className="text-xs">
              <div>{r.phone ?? "—"}</div>
              <div className="text-[var(--color-fg-subtle)]">{r.email ?? ""}</div>
            </div>
          )},
          { key: "status", header: "Status", render: (r) => (
            <Badge tone={r.status === "ACTIVE" ? "success" : "warning"}>{r.status}</Badge>
          )},
          { key: "actions", header: "", render: (r) => (
            canWrite ? (
              <div className="flex justify-end">
                <EditStudentButton
                  student={{
                    id: r.id, admissionNo: r.admissionNo, name: r.name,
                    guardianName: r.guardianName, phone: r.phone, email: r.email,
                    classId: r.classId, batchId: r.batchId, academicYearId: r.academicYearId,
                    status: r.status,
                  }}
                  classes={classes.map((c) => ({ id: c.id, name: c.name }))}
                  batches={batches.map((b) => ({ id: b.id, name: b.name, classId: b.classId }))}
                  years={years.map((y) => ({ id: y.id, name: y.name }))}
                />
                <DeleteButton
                  kind="student" id={r.id} label={`${r.name} (${r.admissionNo})`} what="student"
                  note="Fee assignments without receipts are removed along with the student."
                />
              </div>
            ) : null
          )},
        ]}
      />
      <Pagination page={page.page} totalPages={page.totalPages} total={page.total} pageSize={page.pageSize} />
    </>
  );
}
