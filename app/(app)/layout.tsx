import { requireUser } from "@/lib/auth/session";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { permissionsForRole } from "@/lib/auth/rbac";
import { store } from "@/lib/db/store";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const permissions = permissionsForRole(user.role);
  const instituteName = user.instituteId ? store.institutes.get(user.instituteId)?.name ?? null : null;

  return (
    <div className="flex min-h-dvh">
      <Sidebar role={user.role} permissions={permissions} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header user={{ name: user.name, email: user.email, role: user.role, instituteName }} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
