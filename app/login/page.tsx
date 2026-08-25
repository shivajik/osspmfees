"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Building2, GraduationCap, Loader2, ShieldCheck, Wallet } from "lucide-react";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh grid place-items-center text-sm text-[var(--color-fg-muted)]">Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="min-h-dvh grid lg:grid-cols-[1.08fr_0.92fr]">
      <div className="hidden lg:flex flex-col justify-between border-r border-[var(--color-border)] bg-[var(--color-surface)] p-10">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-[var(--color-brand)] text-sm font-bold text-[var(--color-brand-fg)]">O</div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">OSSPM Ledgerly</span>
            <span className="text-[10px] uppercase tracking-widest text-[var(--color-fg-subtle)]">Fee & expense system</span>
          </div>
        </div>
        <div className="max-w-xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--color-brand)]">Om Shivkrupa Shikshan Prasarak Mandal</p>
          <h2 className="text-4xl font-semibold tracking-tight">Centralized accounts for every OSSPM branch.</h2>
          <p className="mt-3 text-sm text-[var(--color-fg-muted)]">
            Manage branch-wise fee collection, expenses, cash & bank ledgers, users, audit logs, and reports with role-based access.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 text-xs text-[var(--color-fg-muted)]">
            <div className="card p-4">
              <Building2 className="mb-3 h-5 w-5 text-[var(--color-brand)]" />
              <div className="text-lg font-semibold text-[var(--color-fg)]">12 branches</div>
              OSSPM institutes seeded from the branch list
            </div>
            <div className="card p-4">
              <ShieldCheck className="mb-3 h-5 w-5 text-[var(--color-brand)]" />
              <div className="text-lg font-semibold text-[var(--color-fg)]">Role access</div>
              Super admin, branch admin, accountant, cashier
            </div>
            <div className="card p-4">
              <Wallet className="mb-3 h-5 w-5 text-[var(--color-brand)]" />
              <div className="text-lg font-semibold text-[var(--color-fg)]">Cash ledger</div>
              Opening account ready for each branch
            </div>
            <div className="card p-4">
              <GraduationCap className="mb-3 h-5 w-5 text-[var(--color-brand)]" />
              <div className="text-lg font-semibold text-[var(--color-fg)]">2025-26</div>
              Active academic year configured
            </div>
          </div>
        </div>
        <p className="text-xs text-[var(--color-fg-subtle)]">© {new Date().getFullYear()} OSSPM Mandal. All rights reserved.</p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-[var(--color-brand)] text-sm font-bold text-[var(--color-brand-fg)]">O</div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">OSSPM Ledgerly</span>
              <span className="text-[10px] uppercase tracking-widest text-[var(--color-fg-subtle)]">Fee & expense system</span>
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">Enter your OSSPM account credentials.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </Button>
            <p className="text-center text-xs">
              <a href="/forgot-password" className="text-[var(--color-fg-muted)] hover:underline">Forgot password?</a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
