"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { withMinDelay } from "@/lib/utils";
import { updateProfile } from "./actions";

export function EditProfileForm({ name, phone }: { name: string; phone?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const router = useRouter();

  return (
    <form
      className="mt-2 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setPending(true); setError(null); setOk(false);
        const r = await withMinDelay(updateProfile(fd));
        setPending(false);
        if (r?.error) return setError(r.error);
        setOk(true);
        router.refresh();
      }}
    >
      <Field label="Full name"><Input name="name" required maxLength={120} defaultValue={name} /></Field>
      <Field label="Mobile number" hint="Optional"><Input name="phone" maxLength={20} defaultValue={phone ?? ""} /></Field>
      <Button type="submit" disabled={pending} loading={pending}>Save changes</Button>
      {error && <p className="rounded-md bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">{error}</p>}
      {ok && <p className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">Profile updated.</p>}
    </form>
  );
}
