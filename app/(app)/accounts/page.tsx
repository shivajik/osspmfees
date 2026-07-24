import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
export default function AccountsPage() {
  return (
    <>
      <PageHeader title="Bank & cash" description="Ledger balances, transfers, reconciliations." />
      <Card><p className="text-sm text-[var(--color-fg-muted)]">Coming in Milestone 6 — bank & cash ledgers, transfers, reconciliations.</p></Card>
    </>
  );
}
