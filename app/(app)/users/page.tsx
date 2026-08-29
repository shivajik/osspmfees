import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, ROLES, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { store } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { NewUserButton, UserAccessButtons, EditUserButton } from "./_actions";
import { formatDate } from "@/lib/utils";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { parseListParams, paginate } from "@/lib/list-params";

export default async function UsersPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (!hasPermission(permissionsForRole(user.role), PERMISSIONS.USER_MANAGE)) redirect("/dashboard");

  const isSuper = user.role === ROLES.SUPER_ADMIN;
  const all = Array.from(store.users.values()).filter((u) => isSuper || u.instituteId === user.instituteId);
  const institutes = store.institutes;
  const instituteOptions = Array.from(institutes.values()).map((i) => ({ id: i.id, name: i.name }));
  const roleOptions = [ROLES.SUPER_ADMIN, ROLES.INSTITUTE_ADMIN, ROLES.ACCOUNTANT, ROLES.CASHIER, ROLES.VIEWER];

  const sp = await searchParams;
  const params = parseListParams(sp, { filterKeys: isSuper ? ["instituteId", "role"] : ["role"] });
  const q = params.q.toLowerCase();
  const filtered = all.filter((r) => {
    if (params.filters.instituteId && r.instituteId !== params.filters.instituteId) return false;
    if (params.filters.role && r.role !== params.filters.role) return false;
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
  });
  const page = paginate(filtered, params.page, params.pageSize);

  return (
    <>
      <PageHeader
        title="Users"
        description={isSuper ? "All users across every institute." : "Users in your institute."}
        actions={<NewUserButton isSuper={isSuper} institutes={instituteOptions} defaultInstituteId={user.instituteId} />}
      />
      <ListToolbar
        placeholder="Search by name or email…"
        filters={[
          ...(isSuper ? [{ key: "instituteId", label: "Institute", options: instituteOptions.map((i) => ({ value: i.id, label: i.name })) }] : []),
          { key: "role", label: "Role", options: roleOptions.map((r) => ({ value: r, label: r.replace("_", " ") })) },
        ]}
      />
      <DataTable
        rowKey={(r) => r.id}
        rows={page.rows}
        empty="No users match your filters"
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
          { key: "edit", header: "", render: (r) => r.id === user.id ? null : (
            <EditUserButton
              isSuper={isSuper}
              institutes={instituteOptions}
              row={{ id: r.id, name: r.name, email: r.email, phone: r.phone, role: r.role, instituteId: r.instituteId }}
            />
          )},
          { key: "actions", header: "", render: (r) => (
            <UserAccessButtons
              user={{
                id: r.id, name: r.name, email: r.email,
                active: r.active,
                locked: !!(r.lockedUntil && r.lockedUntil > Date.now()),
                isSelf: r.id === user.id,
              }}
            />
          )},
        ]}
      />
      <Pagination page={page.page} totalPages={page.totalPages} total={page.total} pageSize={page.pageSize} />
    </>
  );
}
