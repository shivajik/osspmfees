import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { scopeByInstitute, store } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { NewClassButton } from "./_actions";

export default async function ClassesPage() {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.CLASS_READ)) redirect("/dashboard");

  const rows = scopeByInstitute(store.classes.values(), user.instituteId);
  const canWrite = hasPermission(perms, PERMISSIONS.CLASS_WRITE) && !!user.instituteId;
  const studentsByClass = new Map<string, number>();
  for (const s of store.students.values()) {
    studentsByClass.set(s.classId, (studentsByClass.get(s.classId) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader
        title="Classes"
        description="Grade/standard definitions for this institute."
        actions={canWrite ? <NewClassButton /> : null}
      />
      <DataTable
        rowKey={(r) => r.id}
        rows={rows}
        columns={[
          { key: "name", header: "Class", render: (r) => <span className="font-medium">{r.name}</span> },
          { key: "code", header: "Code", render: (r) => <span className="font-mono text-xs">{r.code ?? "—"}</span> },
          { key: "students", header: "Students", render: (r) => studentsByClass.get(r.id) ?? 0 },
        ]}
      />
    </>
  );
}
