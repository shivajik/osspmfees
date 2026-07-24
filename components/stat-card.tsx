import { cn } from "@/lib/utils";
import * as React from "react";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "brand" | "success" | "warning" | "info";
}) {
  const tones = {
    brand: "from-violet-500/20 to-transparent text-violet-300",
    success: "from-emerald-500/20 to-transparent text-emerald-300",
    warning: "from-amber-500/20 to-transparent text-amber-300",
    info: "from-cyan-500/20 to-transparent text-cyan-300",
  } as const;
  return (
    <div className="card relative overflow-hidden">
      <div className={cn("pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br blur-2xl", tones[tone])} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-fg-muted)]">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          {hint && <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">{hint}</p>}
        </div>
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
