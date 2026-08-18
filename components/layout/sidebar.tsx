"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, Users, GraduationCap, School, CalendarRange,
  ReceiptText, HandCoins, Wallet, Landmark, FileBarChart2, Settings, ShieldCheck, BookOpen, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PERMISSIONS, ROLES, hasPermission, type Permission } from "@/lib/auth/rbac";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  needs?: Permission;
  superOnly?: boolean;
};

const groups: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Platform",
    items: [
      { href: "/institutes", label: "Institutes", icon: Building2, superOnly: true },
      { href: "/users", label: "Users", icon: Users, needs: PERMISSIONS.USER_MANAGE },
      { href: "/audit-logs", label: "Audit logs", icon: ShieldCheck, needs: PERMISSIONS.AUDIT_VIEW },
    ],
  },
  {
    label: "Academic",
    items: [
      { href: "/academic-years", label: "Academic years", icon: CalendarRange, needs: PERMISSIONS.ACADEMIC_YEAR_WRITE },
      { href: "/classes", label: "Classes", icon: School, needs: PERMISSIONS.CLASS_READ },
      { href: "/batches", label: "Divisions", icon: BookOpen, needs: PERMISSIONS.BATCH_READ },
      { href: "/students", label: "Students", icon: GraduationCap, needs: PERMISSIONS.STUDENT_READ },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/fees", label: "Fees", icon: ReceiptText, needs: PERMISSIONS.FEE_READ },
      { href: "/fees/collect", label: "Collect fees", icon: HandCoins, needs: PERMISSIONS.FEE_COLLECT },
      { href: "/expenses", label: "Expenses", icon: Wallet, needs: PERMISSIONS.EXPENSE_READ },
      { href: "/accounts", label: "Bank & cash", icon: Landmark, needs: PERMISSIONS.BANK_READ },
      { href: "/reports", label: "Reports", icon: FileBarChart2, needs: PERMISSIONS.REPORT_VIEW },
    ],
  },
  {
    label: "Account",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

export function Sidebar({ role, permissions }: { role: string; permissions: string[] }) {
  const pathname = usePathname();
  const isSuper = role === ROLES.SUPER_ADMIN;
  return (
    <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex h-14 items-center gap-2 border-b border-[var(--color-border)] px-4">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-indigo-600 to-sky-500 text-xs font-bold text-white">L</div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">Ledgerly</span>
          <span className="text-[10px] uppercase tracking-widest text-[var(--color-fg-subtle)]">Fees & Expense</span>
        </div>
      </div>
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 py-3">
        {groups.map((g) => {
          const visible = g.items.filter((it) => {
            if (it.superOnly) return isSuper;
            if (it.needs) return hasPermission(permissions, it.needs);
            return true;
          });
          if (!visible.length) return null;
          return (
            <div key={g.label} className="mb-4">
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                {g.label}
              </div>
              <ul className="space-y-0.5">
                {visible.map((it) => {
                  const active = pathname === it.href || (pathname.startsWith(it.href + "/") && !visible.some((o) => o !== it && o.href.startsWith(it.href + "/") && (pathname === o.href || pathname.startsWith(o.href + "/"))));
                  const Icon = it.icon;
                  return (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                          active
                            ? "bg-[var(--color-brand-soft)] text-[var(--color-brand)] font-medium"
                            : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{it.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-[var(--color-border)] p-2">
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}

