import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/rbac";
import { store } from "@/lib/db/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DeleteInstituteButton, EditInstituteButton, NewInstituteButton } from "./_actions";
import { formatDate } from "@/lib/utils";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { parseListParams, paginate } from "@/lib/list-params";

export default async function InstitutesPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (user.role !== ROLES.SUPER_ADMIN) redirect("/dashboard");
  const all = Array.from(store.institutes.values());

  const sp = await searchParams;
  const params = parseListParams(sp);
  const q = params.q.toLowerCase();
  const filtered = all.filter((i) => {
    if (!q) return true;
    return (
      i.name.toLowerCase().includes(q) ||
      i.code.toLowerCase().includes(q) ||
      (i.address ?? "").toLowerCase().includes(q) ||
      (i.email ?? "").toLowerCase().includes(q)
    );
  });
  const page = paginate(filtered, params.page, params.pageSize);

  return (
    <>
      <PageHeader
        title="Institutes"
        description="Provision, suspend, or archive tenants on the platform."
        actions={<NewInstituteButton />}
      />
      <ListToolbar placeholder="Search by name, code, address or email…" />
      <DataTable
        rowKey={(r) => r.id}
        rows={page.rows}
        empty="No institutes match your search"
        columns={[
          { key: "name", header: "Institute", render: (r) => (
            <div>
              <Link href={`/institutes/${r.id}`} className="font-medium text-[var(--color-brand)] hover:underline">{r.name}</Link>
              <div className="text-xs text-[var(--color-fg-muted)]">{r.email ?? "—"}</div>
            </div>
          )},
          { key: "code", header: "Code", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
          { key: "address", header: "Address", render: (r) => <span className="text-[var(--color-fg-muted)]">{r.address ?? "—"}</span> },
          { key: "status", header: "Status", render: (r) => (
            <Badge tone={r.status === "ACTIVE" ? "success" : "warning"}>{r.status}</Badge>
          )},
          { key: "created", header: "Created", render: (r) => <span className="text-[var(--color-fg-muted)]">{formatDate(r.createdAt)}</span> },
          { key: "actions", header: "", render: (r) => (
            <div className="flex justify-end gap-1">
              <EditInstituteButton institute={{ id: r.id, name: r.name, code: r.code, email: r.email, phone: r.phone, address: r.address, status: r.status }} />
              <DeleteInstituteButton institute={{ id: r.id, name: r.name, code: r.code }} />
            </div>
          )},
        ]}
      />
      <Pagination page={page.page} totalPages={page.totalPages} total={page.total} pageSize={page.pageSize} />
    </>
  );
}
