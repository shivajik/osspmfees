import * as React from "react";
import { cn } from "@/lib/utils";

export function DataTable<T>({
  columns,
  rows,
  empty = "No records",
  rowKey,
}: {
  columns: {
    key: string;
    header: React.ReactNode;
    className?: string;
    render: (row: T) => React.ReactNode;
    /** Rendered in a totals row under the table; the row appears if any column sets one. */
    footer?: React.ReactNode;
  }[];
  rows: T[];
  empty?: string;
  rowKey: (row: T) => string;
}) {
  const hasFooter = columns.some((c) => c.footer !== undefined);
  return (
    <div className="card overflow-hidden p-0">
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cn("px-4 py-2.5 text-left font-medium text-xs uppercase tracking-wide", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-16 text-center text-[var(--color-fg-muted)]">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={rowKey(r)} className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)]/50">
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-4 py-3 align-middle", c.className)}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {hasFooter && rows.length > 0 && (
            <tfoot className="border-t-2 border-[var(--color-border-strong)] bg-[var(--color-surface-2)] font-medium">
              <tr>
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-4 py-3 align-middle", c.className)}>
                    {c.footer}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
