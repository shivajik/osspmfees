import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" description="Collection, expense, ledger reports with PDF/Excel export." />
      <Card><p className="text-sm text-[var(--color-fg-muted)]">Coming in Milestone 7 — 10 reports with PDF/Excel export.</p></Card>
    </>
  );
}
