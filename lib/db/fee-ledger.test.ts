/**
 * Ledger scenarios from the school's fee confirmation sheet, run against the
 * real store helpers: student-specific + common fees, a conditional TC fee,
 * a carried-forward previous balance, partial payments and a reversal.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  store, assignmentBalance, assignmentFees, assignmentHeadOutstanding, assignmentStatusFor,
  extraChargesTotal, grossPayable, previousDue, type FeeAssignment, type FeePayment,
} from "@/lib/db/store";
import { PREVIOUS_BALANCE_HEAD } from "@/lib/fees/rules";

const INST = "inst_test";
const now = "2026-10-24T00:00:00.000Z";

function structure(id: string, items: { head: string; amount: number }[], totalAmount = items.reduce((s, i) => s + i.amount, 0)) {
  store.feeStructures.set(id, { id, instituteId: INST, academicYearId: "ay_2627", classId: "c1", name: "Class X", totalAmount, items, createdAt: now });
}

function assignment(over: Partial<FeeAssignment>): FeeAssignment {
  const a: FeeAssignment = {
    id: "fa1", instituteId: INST, studentId: "s1", feeStructureId: "fs1", academicYearId: "ay_2627",
    discount: 0, totalPayable: 0, totalPaid: 0, status: "PENDING", createdAt: now, ...over,
  };
  store.feeAssignments.set(a.id, a);
  return a;
}

function pay(a: FeeAssignment, id: string, breakup: { head: string; amount: number }[], voided = false) {
  const amount = breakup.reduce((s, h) => s + h.amount, 0);
  const p: FeePayment = {
    id, instituteId: INST, assignmentId: a.id, studentId: a.studentId, receiptNo: id, amount, mode: "CASH",
    feeHeadBreakup: breakup, paidAt: now, createdBy: "u", createdByName: "U",
    ...(voided ? { voidedAt: now, voidedBy: "u", voidedByName: "U", voidReason: "test" } : {}),
  };
  store.feePayments.set(id, p);
  if (!voided) a.totalPaid += amount;
  a.status = assignmentStatusFor(a);
}

beforeEach(() => {
  store.feeStructures.clear();
  store.feeAssignments.clear();
  store.feePayments.clear();
});

test("conditional TC charge adds to fees, heads and balance", () => {
  structure("fs1", [{ head: "Admission fee", amount: 5000 }, { head: "I unit test", amount: 300 }]);
  const a = assignment({ totalPayable: 5300 });
  a.extraItems = [{ id: "c1", head: "TC fees", amount: 200, addedAt: now, addedBy: "u", addedByName: "U" }];
  a.totalPayable += 200;

  assert.equal(extraChargesTotal(a), 200);
  assert.equal(assignmentFees(a).totalAmount, 5500);
  assert.equal(assignmentBalance(a), 5500);
  assert.deepEqual(assignmentHeadOutstanding(a).map((h) => h.head), ["Admission fee", "I unit test", "TC fees"]);
});

test("partial payments reduce only the heads they were allocated to", () => {
  structure("fs1", [{ head: "Admission fee", amount: 5000 }, { head: "I unit test", amount: 300 }]);
  const a = assignment({ totalPayable: 5300 });
  pay(a, "p1", [{ head: "Admission fee", amount: 2000 }]);
  pay(a, "p2", [{ head: "Admission fee", amount: 500 }, { head: "I unit test", amount: 300 }]);

  assert.deepEqual(assignmentHeadOutstanding(a), [
    { head: "Admission fee", amount: 2500 },
    { head: "I unit test", amount: 0 },
  ]);
  assert.equal(assignmentBalance(a), 2500);
  assert.equal(a.status, "PARTIAL");
});

test("reversed receipts do not reduce what is owed", () => {
  structure("fs1", [{ head: "Admission fee", amount: 5000 }]);
  const a = assignment({ totalPayable: 5000 });
  pay(a, "p1", [{ head: "Admission fee", amount: 1000 }]);
  pay(a, "p2", [{ head: "Admission fee", amount: 4000 }], true);

  assert.equal(assignmentHeadOutstanding(a)[0].amount, 4000);
  assert.equal(assignmentBalance(a), 4000);
});

test("structure total above its listed heads stays collectable as Other fees", () => {
  structure("fs1", [{ head: "Tuition fee", amount: 3000 }], 3500);
  const a = assignment({ totalPayable: 3500 });
  const out = assignmentHeadOutstanding(a);
  assert.deepEqual(out, [{ head: "Tuition fee", amount: 3000 }, { head: "Other fees", amount: 500 }]);
  assert.equal(out.reduce((s, h) => s + h.amount, 0), assignmentBalance(a));
});

test("carried-forward previous balance is counted once and settled first", () => {
  structure("fs1", [{ head: "Tuition fee", amount: 2000 }]);
  const old = assignment({ id: "fa_old", academicYearId: "ay_2526", feeStructureId: "", customItems: [{ head: "Tuition fee", amount: 1000 }], totalPayable: 1000, totalPaid: 400 });
  old.carriedForwardTo = "fa_new";
  const cur = assignment({ id: "fa_new", totalPayable: 2000, previousBalance: 600, carriedFrom: ["fa_old"] });

  // Old year shows nothing outstanding; the 600 lives only on the new year.
  assert.equal(assignmentBalance(old), 0);
  assert.equal(assignmentBalance(cur), 2600);
  assert.equal(grossPayable(cur), 2600);
  assert.equal(assignmentBalance(old) + assignmentBalance(cur), 2600);

  assert.deepEqual(assignmentHeadOutstanding(cur)[0], { head: PREVIOUS_BALANCE_HEAD, amount: 600 });
  pay(cur, "p1", [{ head: PREVIOUS_BALANCE_HEAD, amount: 600 }, { head: "Tuition fee", amount: 100 }]);
  assert.equal(previousDue(cur), 0);
  assert.deepEqual(assignmentHeadOutstanding(cur), [{ head: "Tuition fee", amount: 1900 }]);
  assert.equal(assignmentBalance(cur), 1900);
});

test("custom per-student fees (admission fee differs by student)", () => {
  const a = assignment({ feeStructureId: "", customName: "Fees 2026-27", customItems: [{ head: "Admission fee", amount: 4200 }], totalPayable: 4000, discount: 200 });
  assert.equal(assignmentFees(a).totalAmount, 4200);
  assert.equal(assignmentBalance(a), 4000);
});
