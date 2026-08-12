import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { scopeByInstitute, store } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { NewBatchButton } from "./_actions";

export default async function BatchesPage() {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.BATCH_READ)) redirect("/dashboard");

  const rows = scopeByInstitute(store.batches.values(), user.instituteId);
  const canWrite = hasPermission(perms, PERMISSIONS.BATCH_WRITE) && !!user.instituteId;

  const classes = user.instituteId
    ? scopeByInstitute(store.classes.values(), user.instituteId)
    : Array.from(store.classes.values());
  const years = user.instituteId
    ? scopeByInstitute(store.academicYears.values(), user.instituteId)
    : Array.from(store.academicYears.values());

  return (
    <>
      <PageHeader
        title="Divisions"
        description="Division/section of a class for the current academic year."
        actions={canWrite ? (
          <NewBatchButton
            classes={classes.map((c) => ({ id: c.id, name: c.name }))}
            years={years.map((y) => ({ id: y.id, name: y.name }))}
          />
        ) : null}
      />
      <DataTable
        rowKey={(r) => r.id}
        rows={rows}
        columns={[
          { key: "name", header: "Division", render: (r) => <span className="font-medium">{r.name}</span> },
          { key: "class", header: "Class", render: (r) => store.classes.get(r.classId)?.name ?? "—" },
          { key: "year", header: "Year", render: (r) => store.academicYears.get(r.academicYearId)?.name ?? "—" },
        ]}
      />
    </>
  );
}
