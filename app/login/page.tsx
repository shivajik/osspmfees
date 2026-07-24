"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

const demo = [
  { email: "super@ledgerly.app", label: "Super Admin" },
  { email: "admin@greenwood.edu", label: "Institute Admin" },
  { email: "accountant@greenwood.edu", label: "Accountant" },
  { email: "cashier@greenwood.edu", label: "Cashier" },
  { email: "viewer@greenwood.edu", label: "Viewer" },
];

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("super@ledgerly.app");
  const [password, setPassword] = useState("Password123!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Invalid credentials");
        return;
      }
      router.push(params.get("next") || "/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between border-r border-[var(--color-border)] bg-[var(--color-surface)] p-10">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-violet-500 to-cyan-400 text-sm font-bold text-black">L</div>
          <span className="text-sm font-semibold tracking-tight">Ledgerly</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold tracking-tight">Run your institute&apos;s books with confidence.</h2>
          <p className="mt-3 text-sm text-[var(--color-fg-muted)]">
            Multi-tenant fee collection, expense tracking, cash & bank ledgers, and beautiful reports — all from one dashboard.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3 text-xs text-[var(--color-fg-muted)]">
            <div className="card p-3"><div className="text-lg font-semibold text-[var(--color-fg)]">SOC-ready</div>audit trail</div>
            <div className="card p-3"><div className="text-lg font-semibold text-[var(--color-fg)]">Tenant</div>isolation</div>
            <div className="card p-3"><div className="text-lg font-semibold text-[var(--color-fg)]">RBAC</div>5 roles</div>
          </div>
        </div>
        <p className="text-xs text-[var(--color-fg-subtle)]">© {new Date().getFullYear()} Ledgerly. All rights reserved.</p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">Use a demo account below or your own credentials.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>

          <div className="mt-6">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-fg-subtle)]">Demo accounts</p>
            <div className="mt-2 grid grid-cols-1 gap-1 text-xs">
              {demo.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => { setEmail(d.email); setPassword("Password123!"); }}
                  className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left hover:border-[var(--color-border-strong)]"
                >
                  <span className="text-[var(--color-fg)]">{d.label}</span>
                  <span className="text-[var(--color-fg-muted)]">{d.email}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-[var(--color-fg-subtle)]">Password for all demo accounts: Password123!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
