"use client";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({
  page, totalPages, total, pageSize,
}: { page: number; totalPages: number; total: number; pageSize: number }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const build = (p: number) => {
    const params = new URLSearchParams(sp.toString());
    if (p <= 1) params.delete("page"); else params.set("page", String(p));
    const s = params.toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn = "inline-flex h-8 items-center gap-1 rounded-md border border-[var(--color-border-strong)] px-2.5 text-xs hover:bg-[var(--color-surface-2)]";
  const disabled = "pointer-events-none opacity-40";
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-[var(--color-fg-muted)]">
      <div>{from}–{to} of {total}</div>
      <div className="flex items-center gap-1.5">
        <Link href={build(page - 1)} className={`${btn} ${page <= 1 ? disabled : ""}`}><ChevronLeft className="h-3.5 w-3.5" /> Prev</Link>
        <span className="px-2">Page {page} / {totalPages}</span>
        <Link href={build(page + 1)} className={`${btn} ${page >= totalPages ? disabled : ""}`}>Next <ChevronRight className="h-3.5 w-3.5" /></Link>
      </div>
    </div>
  );
}
