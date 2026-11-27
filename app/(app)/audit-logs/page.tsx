import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, ROLES, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { store } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { parseListParams, paginate } from "@/lib/list-params";

export default async function AuditPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (!hasPermission(permissionsForRole(user.role), PERMISSIONS.AUDIT_VIEW)) redirect("/dashboard");
  const isSuper = user.role === ROLES.SUPER_ADMIN;
  const all = store.auditLogs.filter((a) => isSuper || a.instituteId === user.instituteId);

  const sp = await searchParams;
  const params = parseListParams(sp, { filterKeys: isSuper ? ["instituteId", "area", "entity"] : ["area", "entity"] });
  // "fee.collect" → area "fee": groups related actions into one option.
  const area = (action: string) => action.split(".")[0];
  const areas = Array.from(new Set(all.map((a) => area(a.action)))).sort();
  const entities = Array.from(new Set(all.map((a) => a.entity).filter(Boolean))).sort();
  const instituteOptions = isSuper ? Array.from(store.institutes.values()).map((i) => ({ value: i.id, label: i.name })) : [];

  const q = params.q.toLowerCase();
  const filtered = all.filter((r) => {
    if (params.filters.instituteId && r.instituteId !== params.filters.instituteId) return false;
    if (params.filters.area && area(r.action) !== params.filters.area) return false;
    if (params.filters.entity && r.entity !== params.filters.entity) return false;
    if (!q) return true;
    return [r.actorEmail, r.action, r.entity, r.entityId ?? "", r.ip ?? ""].some((v) => v.toLowerCase().includes(q));
  });
  const page = paginate(filtered, params.page, params.pageSize);

  return (
    <>
      <PageHeader title="Audit logs" description="Immutable trail of privileged operations across the platform." />
      <ListToolbar
        placeholder="Search by user email, action, record id or IP…"
        filters={[
          ...(isSuper ? [{ key: "instituteId", label: "Institute", options: instituteOptions }] : []),
          { key: "area", label: "Action", options: areas.map((a) => ({ value: a, label: a })) },
          { key: "entity", label: "Record", options: entities.map((e) => ({ value: e, label: e })) },
        ]}
      />
      <DataTable
        rowKey={(r) => r.id}
        rows={page.rows}
        empty="No audit events match your filters"
        columns={[
          { key: "when", header: "When", render: (r) => (
            <span className="whitespace-nowrap text-[var(--color-fg-muted)]">{new Date(r.createdAt).toLocaleString()}</span>
          )},
          { key: "actor", header: "Actor", render: (r) => (
            <div>
              <div className="font-medium">{r.actorEmail}</div>
              <div className="text-xs text-[var(--color-fg-subtle)]">{r.actorId}</div>
            </div>
          )},
          { key: "action", header: "Action", render: (r) => <Badge tone="brand">{r.action}</Badge> },
          { key: "entity", header: "Entity", render: (r) => (
            <span className="text-[var(--color-fg-muted)]">{r.entity}{r.entityId ? ` · ${r.entityId}` : ""}</span>
          )},
          { key: "ip", header: "IP", render: (r) => <span className="font-mono text-xs">{r.ip ?? "—"}</span> },
        ]}
      />
      <Pagination page={page.page} totalPages={page.totalPages} total={page.total} pageSize={page.pageSize} />
    </>
  );
}
