import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { scopeByInstitute, store } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { NewClassButton } from "./_actions";
import { DeleteButton } from "@/components/delete-button";
import { compareClassNames, normalizeClassName } from "@/lib/academics";



export default async function ClassesPage() {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.CLASS_READ)) redirect("/dashboard");

  const scoped = scopeByInstitute(store.classes.values(), user.instituteId);
  const canWrite = hasPermission(perms, PERMISSIONS.CLASS_WRITE) && !!user.instituteId;
  const studentsByClass = new Map<string, number>();
  for (const s of store.students.values()) {
    studentsByClass.set(s.classId, (studentsByClass.get(s.classId) ?? 0) + 1);
  }

  // Across institutes the same class exists many times — collapse by name so the
  // list never repeats, and aggregate the student counts of the merged rows.
  const merged = new Map<string, { row: (typeof scoped)[number]; students: number }>();
  for (const r of scoped) {
    const key = user.instituteId ? r.id : normalizeClassName(r.name);
    const existing = merged.get(key);
    const students = studentsByClass.get(r.id) ?? 0;
    if (existing) existing.students += students;
    else merged.set(key, { row: r, students });
  }
  const rows = Array.from(merged.values()).sort((a, b) => compareClassNames(a.row.name, b.row.name));

  return (
    <>
      <PageHeader
        title="Classes"
        description="Grade/standard definitions for this institute."
        actions={canWrite ? <NewClassButton /> : null}
      />
      <DataTable
        rowKey={(r) => r.row.id}
        rows={rows}
        columns={[
          { key: "name", header: "Class", render: (r) => <span className="font-medium">{normalizeClassName(r.row.name)}</span> },
          { key: "code", header: "Code", render: (r) => <span className="font-mono text-xs">{r.row.code ?? "—"}</span> },
          { key: "students", header: "Students", render: (r) => r.students },
          { key: "actions", header: "", render: (r) => canWrite ? (
            <div className="flex justify-end">
              <DeleteButton kind="class" id={r.row.id} label={normalizeClassName(r.row.name)} what="class" />
            </div>
          ) : null },

        ]}
      />

    </>
  );
}
