"use client";
import Link from "next/link";
import { LogOut, Search, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header({ user }: { user: { name: string; email: string; role: string; instituteName?: string | null } }) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  const initials = user.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 px-4 backdrop-blur">
      <div className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
        <input
          placeholder="Search students, receipts, transactions..."
          className="input-base w-full pl-8 text-sm"
        />
      </div>
      <div className="ml-auto flex items-center gap-3">
        {user.instituteName && <Badge tone="info">{user.instituteName}</Badge>}
        <Badge tone="brand">{user.role.replace("_", " ")}</Badge>
        <ThemeToggle />
        <Link
          href="/profile"
          title="Profile"
          className="flex items-center gap-2 rounded-md p-1 hover:bg-[var(--color-surface-2)]"
        >
          <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-indigo-600 to-sky-500 text-xs font-semibold text-white">
            {initials}
          </div>
          <div className="hidden flex-col text-xs leading-tight sm:flex">
            <span className="font-medium">{user.name}</span>
            <span className="text-[var(--color-fg-subtle)]">{user.email}</span>
          </div>
        </Link>
        <button
          onClick={logout}
          title="Sign out"
          className="rounded-md p-2 text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
        >
          <LogOut className="h-4 w-4" />
        </button>
        <User className="hidden" />
      </div>
    </header>
  );
}
