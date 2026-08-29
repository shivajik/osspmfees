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
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { parseListParams, paginate } from "@/lib/list-params";

export default async function AcademicYearsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (!hasPermission(permissionsForRole(user.role), PERMISSIONS.ACADEMIC_YEAR_WRITE)) redirect("/dashboard");
  const scoped = scopeByInstitute(store.academicYears.values(), user.instituteId);
  const instituteName = (id: string) => store.institutes.get(id)?.name ?? "—";
  const instituteOptions = user.instituteId ? [] : Array.from(store.institutes.values()).map((i) => ({ id: i.id, name: i.name }));

  // Institute admins see their own years. Super admins see one row per
  // institute per year so it's clear which institute each row belongs to.
  const sorted = dedupeBy(
    [...scoped].sort((a, b) => {
      if (!user.instituteId) {
        const byInst = instituteName(a.instituteId).localeCompare(instituteName(b.instituteId));
        if (byInst !== 0) return byInst;
      }
      return (b.startDate ?? "").localeCompare(a.startDate ?? "");
    }),
    (r) => (user.instituteId ? r.id : `${r.instituteId}::${r.name.trim().toLowerCase()}`),
  );

  const sp = await searchParams;
  const params = parseListParams(sp, { filterKeys: user.instituteId ? [] : ["instituteId"] });
  const q = params.q.toLowerCase();
  const filtered = sorted.filter((r) => {
    if (params.filters.instituteId && r.instituteId !== params.filters.instituteId) return false;
    if (!q) return true;
    return r.name.toLowerCase().includes(q);
  });
  const page = paginate(filtered, params.page, params.pageSize);

  return (
    <>
      <PageHeader
        title="Academic years"
        description="Define the term your institute is operating in."
        actions={user.instituteId ? <NewAcademicYearButton /> : null}
      />
      <ListToolbar
        placeholder="Search by year…"
        filters={user.instituteId ? [] : [{ key: "instituteId", label: "Institute", options: instituteOptions.map((i) => ({ value: i.id, label: i.name })) }]}
      />
      <DataTable
        rowKey={(r) => r.id}
        rows={page.rows}
        empty={user.instituteId ? "No academic years yet" : "No academic years match your filters"}
        columns={[
          ...(user.instituteId ? [] : [{
            key: "institute",
            header: "Institute",
            render: (r: (typeof sorted)[number]) => instituteName(r.instituteId),
          }]),
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
      <Pagination page={page.page} totalPages={page.totalPages} total={page.total} pageSize={page.pageSize} />
    </>
  );
}
