import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, ROLES, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { store } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { NewUserButton } from "./_actions";
import { formatDate } from "@/lib/utils";

export default async function UsersPage() {
  const user = await requireUser();
  if (!hasPermission(permissionsForRole(user.role), PERMISSIONS.USER_MANAGE)) redirect("/dashboard");

  const isSuper = user.role === ROLES.SUPER_ADMIN;
  const rows = Array.from(store.users.values()).filter((u) => isSuper || u.instituteId === user.instituteId);
  const institutes = store.institutes;

  return (
    <>
      <PageHeader
        title="Users"
        description={isSuper ? "All users across every institute." : "Users in your institute."}
        actions={<NewUserButton isSuper={isSuper} institutes={Array.from(institutes.values()).map((i) => ({ id: i.id, name: i.name }))} defaultInstituteId={user.instituteId} />}
      />
      <DataTable
        rowKey={(r) => r.id}
        rows={rows}
        columns={[
          { key: "name", header: "Name", render: (r) => (
            <div>
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-[var(--color-fg-muted)]">{r.email}</div>
            </div>
          )},
          { key: "role", header: "Role", render: (r) => <Badge tone="brand">{r.role.replace("_", " ")}</Badge> },
          { key: "inst", header: "Institute", render: (r) => (
            <span className="text-[var(--color-fg-muted)]">{r.instituteId ? institutes.get(r.instituteId)?.name ?? "—" : "Platform"}</span>
          )},
          { key: "status", header: "Status", render: (r) => (
            <Badge tone={r.active ? "success" : "warning"}>{r.active ? "Active" : "Disabled"}</Badge>
          )},
          { key: "locked", header: "Lock", render: (r) => (
            r.lockedUntil && r.lockedUntil > Date.now() ? <Badge tone="danger">Locked</Badge> : <span className="text-[var(--color-fg-subtle)]">—</span>
          )},
          { key: "created", header: "Created", render: (r) => <span className="text-[var(--color-fg-muted)]">{formatDate(r.createdAt)}</span> },
        ]}
      />
    </>
  );
}
