"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ResetPasswordPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get("token") ?? "";
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw !== confirm) return setErr("Passwords do not match");
    setBusy(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: pw }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error ?? "Reset failed");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 1500);
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-gradient-to-br from-slate-50 to-indigo-50 p-4 dark:from-slate-950 dark:to-indigo-950">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div>
            <CardTitle>Reset password</CardTitle>
            <CardDescription>Choose a new password for your account.</CardDescription>
          </div>
        </CardHeader>
        {!token ? (
          <p className="mt-4 text-sm text-rose-600">Missing token. Request a new reset link.</p>
        ) : done ? (
          <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
            Password updated. Redirecting to sign in...
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <Input type="password" required placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <Input type="password" required placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <p className="text-xs text-[var(--color-fg-muted)]">Min 10 chars, upper + lower + digit.</p>
            <Button disabled={busy} className="w-full">{busy ? "Saving..." : "Update password"}</Button>
            {err && <p className="rounded-md bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">{err}</p>}
            <p className="text-center text-xs text-[var(--color-fg-muted)]">
              <Link href="/login" className="underline">Back to sign in</Link>
            </p>
          </form>
        )}
      </Card>
    </div>
  );
}
