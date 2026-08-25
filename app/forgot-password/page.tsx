"use client";
import { useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setPreview(null);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg("If an account exists for that email, a reset link has been sent.");
    if (data?.previewLink) setPreview(data.previewLink);
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-gradient-to-br from-slate-50 to-indigo-50 p-4 dark:from-slate-950 dark:to-indigo-950">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div>
            <CardTitle>Forgot password</CardTitle>
            <CardDescription>Enter your email to receive a reset link.</CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <Input type="email" required placeholder="you@institute.edu" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" loading={busy} className="w-full">Send reset link</Button>
          {msg && <p className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">{msg}</p>}
          {preview && (
            <p className="text-xs text-[var(--color-fg-muted)]">
              Local preview link (SMTP is not configured):{" "}
              <Link href={preview} className="text-indigo-600 underline">{preview}</Link>
            </p>
          )}
          <p className="text-center text-xs text-[var(--color-fg-muted)]">
            <Link href="/login" className="underline">Back to sign in</Link>
          </p>
        </form>
      </Card>
    </div>
  );
}
