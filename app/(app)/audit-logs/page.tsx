import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, ROLES, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { store } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default async function AuditPage() {
  const user = await requireUser();
  if (!hasPermission(permissionsForRole(user.role), PERMISSIONS.AUDIT_VIEW)) redirect("/dashboard");
  const isSuper = user.role === ROLES.SUPER_ADMIN;
  const rows = store.auditLogs.filter((a) => isSuper || a.instituteId === user.instituteId);

  return (
    <>
      <PageHeader title="Audit logs" description="Immutable trail of privileged operations across the platform." />
      <DataTable
        rowKey={(r) => r.id}
        rows={rows}
        empty="No audit events yet"
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
    </>
  );
}
