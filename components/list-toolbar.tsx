"use client";
import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

export interface FilterOption { value: string; label: string }
export interface FilterSpec {
  key: string;
  label: string;
  options: FilterOption[];
}

export function ListToolbar({
  placeholder = "Search…",
  filters = [],
}: {
  placeholder?: string;
  filters?: FilterSpec[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = React.useState(sp.get("q") ?? "");
  const [isPending, startTransition] = React.useTransition();

  const [prevSp, setPrevSp] = React.useState(sp);
  if (sp !== prevSp) {
    setPrevSp(sp);
    setQ(sp.get("q") ?? "");
  }

  const buildHref = React.useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(sp.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    });
    params.delete("page");
    const s = params.toString();
    return s ? `${pathname}?${s}` : pathname;
  }, [pathname, sp]);

  const navigate = (href: string) => startTransition(() => router.push(href));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(buildHref({ q: q || null }));
  };

  const hasAny = q || filters.some((f) => sp.get(f.key));

  return (
    <div className="mb-4 flex flex-col gap-3">
      <form onSubmit={onSubmit} className="relative w-full sm:max-w-sm">
        {isPending ? (
          <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--color-brand)]" />
        ) : (
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
        )}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="h-9 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] pl-9 pr-3 text-sm outline-none focus:border-[var(--color-brand)]"
        />
      </form>
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => {
          const cur = sp.get(f.key) ?? "";
          return (
            <select
              key={f.key}
              value={cur}
              onChange={(e) => navigate(buildHref({ [f.key]: e.target.value || null }))}
              disabled={isPending}
              className="h-9 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-sm outline-none focus:border-[var(--color-brand)] disabled:opacity-60"
            >
              <option value="">{f.label}: All</option>
              {f.options.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
            </select>
          );
        })}
        {isPending && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />Updating…
          </span>
        )}
        {hasAny && !isPending && (
          <button
            type="button"
            onClick={() => navigate(pathname)}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-[var(--color-border)] px-2 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>
    </div>
  );
}
