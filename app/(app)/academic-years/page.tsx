import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { scopeByInstitute, store } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { NewAcademicYearButton } from "./_actions";
import { DeleteButton } from "@/components/delete-button";
import { formatDate } from "@/lib/utils";
import { dedupeBy } from "@/lib/academics";


export default async function AcademicYearsPage() {
  const user = await requireUser();
  if (!hasPermission(permissionsForRole(user.role), PERMISSIONS.ACADEMIC_YEAR_WRITE)) redirect("/dashboard");
  const scoped = scopeByInstitute(store.academicYears.values(), user.instituteId);
  // Every institute has its own copy of the same year — collapse by name for the
  // platform-wide (super admin) view so "2025-26" is listed once.
  const rows = dedupeBy(
    [...scoped].sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? "")),
    (r) => (user.instituteId ? r.id : r.name.trim().toLowerCase()),
  );


  return (
    <>
      <PageHeader
        title="Academic years"
        description="Define the term your institute is operating in."
        actions={user.instituteId ? <NewAcademicYearButton /> : null}
      />
      <DataTable
        rowKey={(r) => r.id}
        rows={rows}
        empty={user.instituteId ? "No academic years yet" : "Switch to an institute admin to manage academic years"}
        columns={[
          { key: "name", header: "Year", render: (r) => <span className="font-medium">{r.name}</span> },
          { key: "start", header: "Start", render: (r) => formatDate(r.startDate) },
          { key: "end", header: "End", render: (r) => formatDate(r.endDate) },
          { key: "active", header: "Active", render: (r) => (
            r.isActive ? <Badge tone="success">Current</Badge> : <Badge>Past</Badge>
          )},
          { key: "actions", header: "", render: (r) => user.instituteId ? (
            <div className="flex justify-end">
              <DeleteButton kind="academicYear" id={r.id} label={r.name} what="academic year" />
            </div>
          ) : null },
        ]}
      />
    </>
  );
}
