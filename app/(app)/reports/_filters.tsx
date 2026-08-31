"use client";
import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

/** Super-admin only: narrows every report tab to a single institute. */
export function InstituteFilter({ institutes }: { institutes: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const current = sp.get("instituteId") ?? "";

  const onChange = (value: string) => {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set("instituteId", value);
    else params.delete("instituteId");
    const s = params.toString();
    startTransition(() => router.push(s ? `${pathname}?${s}` : pathname));
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        disabled={isPending}
        className="h-9 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-sm outline-none focus:border-[var(--color-brand)] disabled:opacity-60"
      >
        <option value="">Institute: All</option>
        {institutes.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>
      {isPending && (
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />Updating…
        </span>
      )}
    </div>
  );
}
