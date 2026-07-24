import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/rbac";
import { store } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { NewInstituteButton } from "./_actions";
import { formatDate } from "@/lib/utils";

export default async function InstitutesPage() {
  const user = await requireUser();
  if (user.role !== ROLES.SUPER_ADMIN) redirect("/dashboard");
  const rows = Array.from(store.institutes.values());

  return (
    <>
      <PageHeader
        title="Institutes"
        description="Provision, suspend, or archive tenants on the platform."
        actions={<NewInstituteButton />}
      />
      <DataTable
        rowKey={(r) => r.id}
        rows={rows}
        columns={[
          { key: "name", header: "Institute", render: (r) => (
            <div>
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-[var(--color-fg-muted)]">{r.email ?? "—"}</div>
            </div>
          )},
          { key: "code", header: "Code", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
          { key: "address", header: "Address", render: (r) => <span className="text-[var(--color-fg-muted)]">{r.address ?? "—"}</span> },
          { key: "status", header: "Status", render: (r) => (
            <Badge tone={r.status === "ACTIVE" ? "success" : "warning"}>{r.status}</Badge>
          )},
          { key: "created", header: "Created", render: (r) => <span className="text-[var(--color-fg-muted)]">{formatDate(r.createdAt)}</span> },
        ]}
      />
    </>
  );
}
