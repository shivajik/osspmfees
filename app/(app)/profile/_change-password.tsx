"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { withMinDelay } from "@/lib/utils";

export function ChangePasswordForm() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(false);
    if (next !== confirm) return setErr("New passwords do not match");
    setBusy(true);
    const res = await withMinDelay(fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: cur, newPassword: next }),
    }));
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error ?? "Failed");
      return;
    }
    setCur(""); setNext(""); setConfirm("");
    setOk(true);
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 space-y-3">
      <Input type="password" required placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} />
      <Input type="password" required placeholder="New password" value={next} onChange={(e) => setNext(e.target.value)} />
      <Input type="password" required placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <Button type="submit" disabled={busy} loading={busy}>Update password</Button>
      {err && <p className="rounded-md bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">{err}</p>}
      {ok && <p className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">Password updated.</p>}
    </form>
  );
}
