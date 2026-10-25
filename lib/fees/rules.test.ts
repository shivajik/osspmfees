import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PREVIOUS_BALANCE_HEAD, autoAllocate, headOutstanding, mergeHeads,
  parsePaymentDate, splitSettlement, validateAllocation,
} from "./rules.ts";

const charged = [
  { head: "Admission fee", amount: 5000 },
  { head: "I unit test", amount: 300 },
  { head: "TC fees", amount: 200 },
];

test("mergeHeads combines a head charged twice", () => {
  assert.deepEqual(mergeHeads([{ head: "A", amount: 1 }, { head: "A", amount: 2 }, { head: "B", amount: 3 }]), [
    { head: "A", amount: 3 }, { head: "B", amount: 3 },
  ]);
});

test("headOutstanding subtracts partial payments per head and lists previous dues first", () => {
  const out = headOutstanding(charged, [[{ head: "Admission fee", amount: 2000 }], [{ head: "Admission fee", amount: 1000 }]], 1500);
  assert.deepEqual(out, [
    { head: PREVIOUS_BALANCE_HEAD, amount: 1500 },
    { head: "Admission fee", amount: 2000 },
    { head: "I unit test", amount: 300 },
    { head: "TC fees", amount: 200 },
  ]);
});

test("headOutstanding never goes negative (over-allocated legacy data)", () => {
  const out = headOutstanding(charged, [[{ head: "TC fees", amount: 999 }]], 0);
  assert.equal(out.find((h) => h.head === "TC fees")?.amount, 0);
});

test("validateAllocation accepts an exact, in-limit split", () => {
  const out = headOutstanding(charged, [], 0);
  assert.equal(validateAllocation([{ head: "Admission fee", amount: 700 }, { head: "TC fees", amount: 200 }], out, 900), null);
});

test("validateAllocation rejects over-allocation to a head", () => {
  const out = headOutstanding(charged, [], 0);
  assert.match(validateAllocation([{ head: "TC fees", amount: 500 }], out, 500) ?? "", /exceeds/);
});

test("validateAllocation rejects heads not charged to the student", () => {
  const out = headOutstanding(charged, [], 0);
  assert.match(validateAllocation([{ head: "Board exam fees", amount: 100 }], out, 100) ?? "", /not charged/);
});

test("validateAllocation rejects mismatched totals, duplicates, empty and fractional input", () => {
  const out = headOutstanding(charged, [], 0);
  assert.match(validateAllocation([{ head: "Admission fee", amount: 100 }], out, 200) ?? "", /add up/);
  assert.match(validateAllocation([{ head: "Admission fee", amount: 50 }, { head: "Admission fee", amount: 50 }], out, 100) ?? "", /twice/);
  assert.match(validateAllocation([], out, 100) ?? "", /at least one/);
  assert.match(validateAllocation([{ head: "Admission fee", amount: 10.5 }], out, 10.5) ?? "", /whole-rupee/);
});

test("autoAllocate fills previous dues first, then heads in order", () => {
  const out = headOutstanding(charged, [], 1000);
  assert.deepEqual(autoAllocate(out, 1200), [
    { head: PREVIOUS_BALANCE_HEAD, amount: 1000 },
    { head: "Admission fee", amount: 200 },
  ]);
  assert.deepEqual(autoAllocate(out, 0), []);
  // More than owed: allocation is capped at what is outstanding.
  assert.equal(autoAllocate(out, 1_000_000).reduce((s, h) => s + h.amount, 0), 6500);
});

test("splitSettlement clears carried-forward dues before current year", () => {
  assert.deepEqual(splitSettlement(1000, 0, 600), { toPrevious: 600, toCurrent: 0 });
  assert.deepEqual(splitSettlement(1000, 600, 600), { toPrevious: 400, toCurrent: 200 });
  assert.deepEqual(splitSettlement(1000, 1500, 300), { toPrevious: 0, toCurrent: 300 });
  assert.deepEqual(splitSettlement(0, 0, 300), { toPrevious: 0, toCurrent: 300 });
});

test("parsePaymentDate handles blank, today, backdated, future and malformed input", () => {
  const now = new Date("2026-10-24T08:30:00.000Z");
  assert.equal(parsePaymentDate(undefined, now).iso, now.toISOString());
  assert.equal(parsePaymentDate("2026-10-24", now).iso, now.toISOString());
  assert.equal(parsePaymentDate("2026-10-01", now).iso, "2026-10-01T12:00:00.000Z");
  assert.match(parsePaymentDate("2026-10-25", now).error ?? "", /future/);
  assert.match(parsePaymentDate("2024-01-01", now).error ?? "", /days old/);
  assert.match(parsePaymentDate("2026-02-30", now).error ?? "", /Invalid/);
  assert.match(parsePaymentDate("24/10/2026", now).error ?? "", /Invalid/);
});
