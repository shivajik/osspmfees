/**
 * Pure fee-ledger rules — no store, no framework imports — so the money logic
 * can be unit tested in isolation (`npm test`). Server actions and pages call
 * these; they must stay the single source of truth for each rule.
 */

export type HeadAmount = { head: string; amount: number };

/** Label used for carried-forward dues in a per-head allocation. */
export const PREVIOUS_BALANCE_HEAD = "Previous year balance";

/** How far back a payment may be dated (counter staff entering late receipts). */
export const MAX_BACKDATE_DAYS = 365;

export function sumAmounts(items: readonly HeadAmount[]): number {
  return items.reduce((s, i) => s + i.amount, 0);
}

/** Merges duplicate head names so a head charged twice reads as one line. */
export function mergeHeads(items: readonly HeadAmount[]): HeadAmount[] {
  const map = new Map<string, number>();
  for (const i of items) map.set(i.head, (map.get(i.head) ?? 0) + i.amount);
  return Array.from(map, ([head, amount]) => ({ head, amount }));
}

/**
 * What is still owed per fee head, given the heads charged and the per-head
 * breakup of every *active* payment (reversed receipts must be excluded by the
 * caller). The carried-forward balance is exposed as its own head first, which
 * matches the settlement priority used by `splitSettlement`.
 */
export function headOutstanding(
  charged: readonly HeadAmount[],
  paidBreakups: readonly (readonly HeadAmount[])[],
  previousDue: number,
): HeadAmount[] {
  const paid = new Map<string, number>();
  for (const b of paidBreakups) for (const h of b) paid.set(h.head, (paid.get(h.head) ?? 0) + h.amount);
  const rows = mergeHeads(charged).map((c) => ({
    head: c.head,
    amount: Math.max(0, c.amount - (paid.get(c.head) ?? 0)),
  }));
  return previousDue > 0 ? [{ head: PREVIOUS_BALANCE_HEAD, amount: previousDue }, ...rows] : rows;
}

/**
 * Validates a cashier's per-head allocation. Returns an error message, or null
 * when the breakup is acceptable.
 */
export function validateAllocation(
  breakup: readonly HeadAmount[],
  outstanding: readonly HeadAmount[],
  settled: number,
): string | null {
  if (!breakup.length) return "Select at least one fee head for this payment";
  const seen = new Set<string>();
  for (const b of breakup) {
    if (!Number.isInteger(b.amount) || b.amount <= 0) return `Enter a whole-rupee amount for ${b.head}`;
    if (seen.has(b.head)) return `${b.head} is listed twice`;
    seen.add(b.head);
    const due = outstanding.find((o) => o.head === b.head);
    if (!due) return `${b.head} is not charged to this student`;
    if (b.amount > due.amount) {
      return `${b.head}: ₹${b.amount.toLocaleString("en-IN")} exceeds the ₹${due.amount.toLocaleString("en-IN")} still owed`;
    }
  }
  const total = sumAmounts(breakup);
  if (total !== settled) {
    return `Fee head amounts add up to ₹${total.toLocaleString("en-IN")} but this payment settles ₹${settled.toLocaleString("en-IN")}. Adjust the head amounts so both match.`;
  }
  return null;
}

/**
 * Priority allocation used when staff choose "auto": previous-year dues first,
 * then heads in the order they were charged.
 */
export function autoAllocate(outstanding: readonly HeadAmount[], amount: number): HeadAmount[] {
  let left = Math.max(0, Math.round(amount));
  const out: HeadAmount[] = [];
  for (const h of outstanding) {
    if (left <= 0) break;
    if (h.amount <= 0) continue;
    const take = Math.min(left, h.amount);
    out.push({ head: h.head, amount: take });
    left -= take;
  }
  return out;
}

/**
 * Splits what a payment settles between carried-forward dues and the current
 * year. Older dues are always cleared first so they are never double-counted.
 */
export function splitSettlement(previousBalance: number, settledBefore: number, settled: number) {
  const prevDue = Math.max(0, previousBalance - settledBefore);
  const toPrevious = Math.min(settled, prevDue);
  return { toPrevious, toCurrent: settled - toPrevious };
}

/**
 * Parses the date a payment was received. Blank means "now". Future dates and
 * anything older than MAX_BACKDATE_DAYS are rejected. A bare YYYY-MM-DD for
 * today keeps the current time so same-day receipts still sort correctly.
 */
export function parsePaymentDate(input: string | undefined, now: Date = new Date()): { iso?: string; error?: string } {
  if (!input) return { iso: now.toISOString() };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return { error: "Invalid payment date" };
  const d = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== input) return { error: "Invalid payment date" };
  const today = now.toISOString().slice(0, 10);
  if (input > today) return { error: "Payment date cannot be in the future" };
  const oldest = new Date(now.getTime() - MAX_BACKDATE_DAYS * 86_400_000).toISOString().slice(0, 10);
  if (input < oldest) return { error: `Payment date cannot be more than ${MAX_BACKDATE_DAYS} days old` };
  if (input === today) return { iso: now.toISOString() };
  // Midday UTC keeps the calendar date stable across Indian/UTC rendering.
  return { iso: `${input}T12:00:00.000Z` };
}
