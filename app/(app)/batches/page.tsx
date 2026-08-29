import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { scopeByInstitute, store } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { NewBatchButton } from "./_actions";
import { DeleteButton } from "@/components/delete-button";
import { compareClassNames, dedupeBy, normalizeClassName } from "@/lib/academics";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { parseListParams, paginate } from "@/lib/list-params";

export default async function BatchesPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.BATCH_READ)) redirect("/dashboard");

  const scopedBatches = scopeByInstitute(store.batches.values(), user.instituteId);
  const canWrite = hasPermission(perms, PERMISSIONS.BATCH_WRITE) && !!user.instituteId;

  const className = (id: string) => {
    const raw = store.classes.get(id)?.name;
    return raw ? normalizeClassName(raw) : "—";
  };

  const instituteName = (id: string) => store.institutes.get(id)?.name ?? "—";

  // Institute admins: one row per division. Super admins: keep every institute's
  // division but label it, so ownership is always visible.
  const sorted = dedupeBy(
    [...scopedBatches].sort((a, b) => {
      if (!user.instituteId) {
        const byInst = instituteName(a.instituteId).localeCompare(instituteName(b.instituteId));
        if (byInst !== 0) return byInst;
      }
      const byClass = compareClassNames(store.classes.get(a.classId)?.name ?? "", store.classes.get(b.classId)?.name ?? "");
      if (byClass !== 0) return byClass;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    }),
    (r) => (user.instituteId ? r.id : `${r.instituteId}::${className(r.classId)}::${r.name.trim().toLowerCase()}`),
  );
  const instituteOptions = user.instituteId ? [] : Array.from(store.institutes.values()).map((i) => ({ id: i.id, name: i.name }));

  const classes = dedupeBy(
    (user.instituteId
      ? scopeByInstitute(store.classes.values(), user.instituteId)
      : Array.from(store.classes.values())
    ).sort((a, b) => compareClassNames(a.name, b.name)),
    (c) => (user.instituteId ? c.id : normalizeClassName(c.name)),
  );
  const years = dedupeBy(
    user.instituteId
      ? scopeByInstitute(store.academicYears.values(), user.instituteId)
      : Array.from(store.academicYears.values()),
    (y) => (user.instituteId ? y.id : y.name.trim().toLowerCase()),
  );


  const sp = await searchParams;
  const params = parseListParams(sp, { filterKeys: user.instituteId ? [] : ["instituteId"] });
  const q = params.q.toLowerCase();
  const filtered = sorted.filter((r) => {
    if (params.filters.instituteId && r.instituteId !== params.filters.instituteId) return false;
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || className(r.classId).toLowerCase().includes(q);
  });
  const page = paginate(filtered, params.page, params.pageSize);

  return (
    <>
      <PageHeader
        title="Divisions"
        description="Division/section of a class for the current academic year."
        actions={canWrite ? (
          <NewBatchButton
            classes={classes.map((c) => ({ id: c.id, name: normalizeClassName(c.name) }))}
            years={years.map((y) => ({ id: y.id, name: y.name, isActive: y.isActive }))}
          />
        ) : null}
      />
      <ListToolbar
        placeholder="Search by division or class…"
        filters={user.instituteId ? [] : [{ key: "instituteId", label: "Institute", options: instituteOptions.map((i) => ({ value: i.id, label: i.name })) }]}
      />
      <DataTable
        rowKey={(r) => r.id}
        rows={page.rows}
        empty="No divisions match your filters"
        columns={[
          ...(user.instituteId ? [] : [{
            key: "institute",
            header: "Institute",
            render: (r: (typeof sorted)[number]) => instituteName(r.instituteId),
          }]),
          { key: "name", header: "Division", render: (r) => <span className="font-medium">{r.name}</span> },
          { key: "class", header: "Class", render: (r) => className(r.classId) },
          { key: "year", header: "Year", render: (r) => store.academicYears.get(r.academicYearId)?.name ?? "—" },
          { key: "actions", header: "", render: (r) => canWrite ? (
            <div className="flex justify-end">
              <DeleteButton kind="batch" id={r.id} label={r.name} what="division" />
            </div>
          ) : null },
        ]}
      />
      <Pagination page={page.page} totalPages={page.totalPages} total={page.total} pageSize={page.pageSize} />
    </>
  );
}
