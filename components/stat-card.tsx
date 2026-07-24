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
  const iconTones = {
    brand: "bg-indigo-50 text-indigo-600",
    success: "bg-emerald-50 text-emerald-600",
    warning: "bg-amber-50 text-amber-600",
    info: "bg-sky-50 text-sky-600",
  } as const;
  return (
    <div className="card relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-fg-muted)]">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          {hint && <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">{hint}</p>}
        </div>
        <div className={cn("grid h-9 w-9 place-items-center rounded-lg", iconTones[tone])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
