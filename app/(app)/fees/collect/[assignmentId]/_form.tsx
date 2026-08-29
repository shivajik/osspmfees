"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { collectFee } from "../../actions";

type Mode = "CASH" | "BANK" | "CARD" | "UPI" | "CHEQUE" | "ONLINE";
type HeadRef = { head: string; remaining: number };

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Fills heads in order (previous-year balance first, matching the server's own settlement priority) until the amount runs out. */
function allocate(allHeads: HeadRef[], amountToAllocate: number): Record<string, string> {
  let left = Math.max(0, Math.round(amountToAllocate));
  const next: Record<string, string> = {};
  for (const h of allHeads) {
    if (left <= 0 || h.remaining <= 0) continue;
    const take = Math.min(left, h.remaining);
    next[h.head] = String(take);
    left -= take;
  }
  return next;
}

export function CollectFeeForm({
  assignmentId, balance, previousDue, heads, accounts,
}: {
  assignmentId: string;
  balance: number;
  previousDue: number;
  heads: HeadRef[];
  accounts: { id: string; name: string; type: "BANK" | "CASH" }[];
}) {
  const allHeads: HeadRef[] = previousDue > 0 ? [{ head: "Previous year balance", remaining: previousDue }, ...heads] : heads;

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("CASH");
  const [kind, setKind] = useState<"FULL" | "PARTIAL">("FULL");
  const [amount, setAmount] = useState<number>(balance);
  const [discount, setDiscount] = useState<number>(0);
  const [headAmounts, setHeadAmounts] = useState<Record<string, string>>(() => allocate(allHeads, balance));
  const router = useRouter();

  const defaultAccount = accounts.find((a) => (mode === "CASH" ? a.type === "CASH" : a.type === "BANK"));
  const safeDiscount = Number.isFinite(discount) ? Math.min(Math.max(discount, 0), balance) : 0;
  const safeAmount = Number.isFinite(amount) ? Math.min(Math.max(amount, 0), balance - safeDiscount) : 0;
  const settled = safeAmount + safeDiscount;
  const remaining = balance - settled;
  const toPrevious = Math.min(settled, previousDue);
  const toCurrent = settled - toPrevious;
  const headBreakup = Object.entries(headAmounts)
    .map(([head, v]) => ({ head, amount: Number(v) || 0 }))
    .filter((h) => h.amount > 0);
  const headsTotal = headBreakup.reduce((s, h) => s + h.amount, 0);

  function applyAmount(next: number, nextDiscount = safeDiscount) {
    setAmount(next);
    setKind(next >= balance - nextDiscount ? "FULL" : "PARTIAL");
    setHeadAmounts(allocate(allHeads, next + nextDiscount));
  }

  return (
    <Card>
      <form
        action={async (fd) => {
          setPending(true); setError(null);
          const r = await collectFee(fd);
          setPending(false);
          if (r?.error) return setError(r.error);
          router.push(`/fees/receipts/${r?.paymentId}`);
        }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <input type="hidden" name="assignmentId" value={assignmentId} />

        <div className="sm:col-span-2">
          <Field label="Payment type">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => applyAmount(balance - safeDiscount)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm ${kind === "FULL" ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)] font-medium" : "border-[var(--color-border)] text-[var(--color-fg-muted)]"}`}
              >
                Full payment ({inr(Math.max(0, balance - safeDiscount))})
              </button>
              <button
                type="button"
                onClick={() => applyAmount(0)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm ${kind === "PARTIAL" ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)] font-medium" : "border-[var(--color-border)] text-[var(--color-fg-muted)]"}`}
              >
                Partial payment
              </button>
            </div>
          </Field>
        </div>

        <Field label="Amount received *" hint={`Max ${inr(Math.max(0, balance - safeDiscount))}`}>
          <Input
            name="amount" type="number" min="0" max={Math.max(0, balance - safeDiscount)} step="1" required
            value={Number.isFinite(amount) ? String(amount) : ""}
            onChange={(e) => applyAmount(Number(e.target.value))}
          />
        </Field>
        <Field label="Mode *">
          <Select name="mode" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="CASH">Cash</option>
            <option value="BANK">Bank transfer</option>
            <option value="UPI">UPI</option>
            <option value="CARD">Card</option>
            <option value="CHEQUE">Cheque</option>
            <option value="ONLINE">Online gateway</option>
          </Select>
        </Field>

        <div className="sm:col-span-2">
          <Field
            label="Fee types / heads *"
            hint="Automatically split from the assigned fee structure — adjust any head if needed."
          >
            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
              {allHeads.length === 0 && <p className="text-xs text-[var(--color-fg-muted)]">No fee structure heads found for this assignment.</p>}
              {allHeads.map((h) => {
                const checked = h.head in headAmounts;
                return (
                  <div key={h.head} className="flex items-center gap-2">
                    <label className="flex flex-1 items-center gap-2 text-sm">
                      <input
                        type="checkbox" className="h-4 w-4" checked={checked}
                        onChange={(e) =>
                          setHeadAmounts((prev) => {
                            const next = { ...prev };
                            if (e.target.checked) next[h.head] = String(Math.min(h.remaining, Math.max(0, settled - headsTotal)) || h.remaining);
                            else delete next[h.head];
                            return next;
                          })
                        }
                      />
                      {h.head}
                      <span className="text-xs text-[var(--color-fg-subtle)]">(owes {inr(h.remaining)})</span>
                    </label>
                    <Input
                      className="w-32" type="number" min="0" step="1" placeholder="Amount"
                      disabled={!checked}
                      value={headAmounts[h.head] ?? ""}
                      onChange={(e) => setHeadAmounts((prev) => ({ ...prev, [h.head]: e.target.value }))}
                    />
                  </div>
                );
              })}
            </div>
          </Field>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-[var(--color-fg-muted)]">Allocated across heads</span>
            <span className={headsTotal === settled ? "font-medium text-emerald-600" : "font-medium text-amber-600"}>
              {inr(headsTotal)} of {inr(settled)}
            </span>
          </div>
          <input type="hidden" name="feeHeads" value={JSON.stringify(headBreakup)} />
          <input type="hidden" name="feeHead" value={headBreakup.map((h) => h.head).join(", ")} />
        </div>

        <Field label="Discount / concession" hint="Counts as fees paid — no money is received">
          <Input
            name="discount" type="number" min="0" max={balance} step="1"
            value={Number.isFinite(discount) ? String(discount) : ""}
            onChange={(e) => {
              const v = Number(e.target.value);
              setDiscount(v);
              applyAmount(Math.min(safeAmount, balance - v), v);
            }}
          />
        </Field>
        <Field label="Discount reason / approved by" hint="Your name is recorded as the approver">
          <Input name="discountReason" maxLength={160} placeholder="Sibling concession" />
        </Field>

        <div className="sm:col-span-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
          {previousDue > 0 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-fg-muted)]">Adjusted against previous year balance</span>
                <span className="font-semibold">{inr(toPrevious)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[var(--color-fg-muted)]">Adjusted against current year fees</span>
                <span className="font-semibold">{inr(toCurrent)}</span>
              </div>
              <div className="my-2 border-t border-[var(--color-border)]" />
            </>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-fg-muted)]">Paying now</span>
            <span className="font-semibold">{inr(safeAmount)}</span>
          </div>
          {safeDiscount > 0 && (
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[var(--color-fg-muted)]">Discount granted</span>
              <span className="font-semibold text-[var(--color-brand)]">{inr(safeDiscount)}</span>
            </div>
          )}
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[var(--color-fg-muted)]">Remaining after this payment</span>
            <span className={`font-semibold ${remaining === 0 ? "text-emerald-600" : "text-amber-600"}`}>{inr(remaining)}</span>
          </div>
        </div>

        <div className="sm:col-span-2">
          <Field label="Account *">
            <Select name="accountId" defaultValue={defaultAccount?.id ?? ""} required>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
            </Select>
          </Field>
        </div>
        {mode === "CHEQUE" && (
          <div className="sm:col-span-2 grid grid-cols-1 gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 sm:grid-cols-2">
            <p className="sm:col-span-2 text-xs font-medium">Cheque details</p>
            <Field label="Cheque number *"><Input name="chequeNo" required maxLength={40} /></Field>
            <Field label="Cheque date *"><Input name="chequeDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
            <Field label="Bank name *"><Input name="chequeBank" required maxLength={80} /></Field>
            <Field label="Branch" hint="Optional"><Input name="chequeBranch" maxLength={80} /></Field>
          </div>
        )}
        <div className="sm:col-span-2">
          <Field label="Reference" hint="Transaction ID / remarks (optional)">
            <Input name="reference" maxLength={80} />
          </Field>
        </div>
        {error && <p className="sm:col-span-2 text-xs text-red-600">{error}</p>}

        <div className="sm:col-span-2 flex justify-end gap-2">
          <Button type="submit" disabled={pending || settled <= 0} loading={pending}>Record payment</Button>
        </div>
      </form>
    </Card>
  );
}
