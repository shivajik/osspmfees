import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";

export default function FeesPage() {
  return (
    <>
      <PageHeader title="Fees" description="Fee structures, assignment, collection, receipts." />
      <Card><p className="text-sm text-[var(--color-fg-muted)]">Coming in Milestone 5 — fee structures, assignment, partial payments, receipts.</p></Card>
    </>
  );
}
