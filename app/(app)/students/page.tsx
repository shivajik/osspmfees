import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { scopeByInstitute, store } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { NewStudentButton } from "./_actions";

export default async function StudentsPage() {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.STUDENT_READ)) redirect("/dashboard");

  const rows = scopeByInstitute(store.students.values(), user.instituteId);
  const canWrite = hasPermission(perms, PERMISSIONS.STUDENT_WRITE) && !!user.instituteId;

  const classes = user.instituteId ? scopeByInstitute(store.classes.values(), user.instituteId) : [];
  const batches = user.instituteId ? scopeByInstitute(store.batches.values(), user.instituteId) : [];
  const years = user.instituteId ? scopeByInstitute(store.academicYears.values(), user.instituteId) : [];

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
      <DataTable
        rowKey={(r) => r.id}
        rows={rows}
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
    </>
  );
}
