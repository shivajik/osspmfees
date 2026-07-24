import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
export default function ExpensesPage() {
  return (
    <>
      <PageHeader title="Expenses" description="Categories, vouchers, approval workflow." />
      <Card><p className="text-sm text-[var(--color-fg-muted)]">Coming in Milestone 6 — expense categories, vouchers, bank/cash accounts.</p></Card>
    </>
  );
}
