"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ChangePasswordGate({ email }: { email: string }) {
  const router = useRouter();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (next !== confirm) return setErr("New passwords do not match");
    if (next === cur) return setErr("Choose a password different from your temporary one");
    setBusy(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: cur, newPassword: next }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error ?? "Failed to update password");
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1000);
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-gradient-to-br from-slate-50 to-indigo-50 p-4 dark:from-slate-950 dark:to-indigo-950">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div>
            <CardTitle>Set a new password</CardTitle>
            <CardDescription>
              For security, {email} must set a new password before continuing.
            </CardDescription>
          </div>
        </CardHeader>
        {done ? (
          <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
            Password updated. Redirecting…
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <Input type="password" required autoComplete="current-password" placeholder="Current (temporary) password" value={cur} onChange={(e) => setCur(e.target.value)} />
            <Input type="password" required autoComplete="new-password" placeholder="New password" value={next} onChange={(e) => setNext(e.target.value)} />
            <Input type="password" required autoComplete="new-password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <p className="text-xs text-[var(--color-fg-muted)]">Min 10 chars, upper + lower + digit.</p>
            <Button disabled={busy} className="w-full">{busy ? "Saving..." : "Update password"}</Button>
            {err && <p className="rounded-md bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">{err}</p>}
            <p className="text-center text-xs">
              <button type="button" onClick={signOut} className="text-[var(--color-fg-muted)] underline">
                Sign out instead
              </button>
            </p>
          </form>
        )}
      </Card>
    </div>
  );
}
