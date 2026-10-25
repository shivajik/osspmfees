/**
 * End-to-end tests of the fee server actions against the real store, with only
 * the session (who is logged in) and persistence (Supabase save) mocked.
 * Covers the client confirmation sheet scenarios plus security / abuse cases.
 */
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../..");
const file = (p: string) => pathToFileURL(path.join(root, p)).href;

type U = { id: string; name: string; email: string; role: string; instituteId: string | null };
let currentUser: U;
const admin: U = { id: "u_admin", name: "Admin", email: "a@x", role: "INSTITUTE_ADMIN", instituteId: "inst_a" };
const cashier: U = { id: "u_cash", name: "Cashier", email: "c@x", role: "CASHIER", instituteId: "inst_a" };
const viewer: U = { id: "u_view", name: "Viewer", email: "v@x", role: "VIEWER", instituteId: "inst_a" };
const otherSchool: U = { id: "u_other", name: "Other", email: "o@x", role: "INSTITUTE_ADMIN", instituteId: "inst_b" };

mock.module(file("lib/auth/session.ts"), { namedExports: { requireUser: async () => currentUser } });
mock.module(file("lib/db/persistence.ts"), { namedExports: { saveStore: async () => {}, loadStore: async () => {} } });

const { store } = await import("@/lib/db/store");
const A = await import("@/app/(app)/fees/actions");
const S = await import("@/lib/db/store");

const now = new Date().toISOString();
const today = now.slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

function fd(o: Record<string, string | number>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, String(v));
  return f;
}

function reset() {
  for (const k of ["institutes", "academicYears", "classes", "students", "feeStructures", "feeAssignments", "feePayments", "accounts", "transactions"] as const) {
    (store[k] as Map<string, unknown>).clear();
  }
  store.auditLogs.length = 0;
  for (const inst of ["inst_a", "inst_b"]) {
    store.accounts.set(`cash_${inst}`, { id: `cash_${inst}`, instituteId: inst, name: "Cash", type: "CASH", openingBal: 0, currentBal: 0, createdAt: now });
  }
  store.academicYears.set("ay_old", { id: "ay_old", instituteId: "inst_a", name: "2024-25", startDate: "2024-06-01", endDate: "2025-05-31", isActive: false, createdAt: now });
  store.academicYears.set("ay_cur", { id: "ay_cur", instituteId: "inst_a", name: "2025-26", startDate: "2025-06-01", endDate: "2026-05-31", isActive: true, createdAt: now });
  store.classes.set("c10", { id: "c10", instituteId: "inst_a", name: "Class 10", createdAt: now });
  for (const [id, name] of [["s1", "Ramesh"], ["s2", "Sita"]]) {
    store.students.set(id, { id, instituteId: "inst_a", admissionNo: id, name, classId: "c10", batchId: "b", academicYearId: "ay_cur", status: "ACTIVE", createdAt: now });
  }
  store.feeStructures.set("fs10", {
    id: "fs10", instituteId: "inst_a", academicYearId: "ay_cur", classId: "c10", name: "Grade 10 Fees", totalAmount: 6000,
    items: [{ head: "Admission fee", amount: 5000 }, { head: "I unit test", amount: 300 }, { head: "I term exam", amount: 700 }],
    createdAt: now,
  });
  currentUser = admin;
}
beforeEach(reset);

async function setupOldYear(studentId = "s1", amount = 1000) {
  const r = await A.setupStudentFees(fd({ studentId, mode: "CUSTOM", academicYearId: "ay_old", items: `Tuition fee:${amount}` }));
  assert.ok(r.assignmentId, r.error);
  return r.assignmentId!;
}
async function assignCurrent(studentId = "s1") {
  const r = await A.assignFees(fd({ feeStructureId: "fs10", studentId, carryForward: "on" }));
  assert.equal(r.error, undefined);
  return Array.from(store.feeAssignments.values()).find((a) => a.studentId === studentId && a.feeStructureId === "fs10")!;
}
function collect(assignmentId: string, heads: { head: string; amount: number }[], extra: Record<string, string | number> = {}) {
  const amount = heads.reduce((s, h) => s + h.amount, 0) - Number(extra.discount ?? 0);
  return A.collectFee(fd({ assignmentId, amount, mode: "CASH", accountId: "cash_inst_a", feeHeads: JSON.stringify(heads), ...extra }));
}
const cash = () => store.accounts.get("cash_inst_a")!.currentBal;

// --- PDF 4: previous year balance ------------------------------------------------

test("previous-year dues carry forward once and are settled first", async () => {
  const oldId = await setupOldYear();
  assert.ok((await collect(oldId, [{ head: "Tuition fee", amount: 400 }])).paymentId);
  const cur = await assignCurrent();
  const old = store.feeAssignments.get(oldId)!;

  assert.equal(old.carriedForwardTo, cur.id);
  assert.equal(S.assignmentBalance(old), 0);
  assert.equal(cur.previousBalance, 600);
  assert.equal(S.assignmentBalance(cur), 6600);
  // The old year cannot be collected against any more.
  assert.match((await collect(oldId, [{ head: "Tuition fee", amount: 100 }])).error ?? "", /carried forward/);

  const r = await collect(cur.id, [{ head: "Previous year balance", amount: 600 }, { head: "Admission fee", amount: 400 }]);
  const p = store.feePayments.get(r.paymentId!)!;
  assert.equal(p.appliedToPrevious, 600);
  assert.equal(p.appliedToCurrent, 400);
  assert.equal(S.assignmentBalance(cur), 5600);
});

test("carry-forward runs only once even if assigned again", async () => {
  await setupOldYear();
  const cur = await assignCurrent();
  await A.assignFees(fd({ feeStructureId: "fs10", studentId: "s1", carryForward: "on" }));
  assert.equal(store.feeAssignments.get(cur.id)!.previousBalance, 1000);
});

// --- PDF 5: partial payments + head allocation -----------------------------------

test("partial payments by head, then full settlement marks PAID", async () => {
  const cur = await assignCurrent("s2");
  await collect(cur.id, [{ head: "Admission fee", amount: 2000 }]);
  await collect(cur.id, [{ head: "Admission fee", amount: 3000 }, { head: "I unit test", amount: 300 }]);
  assert.equal(cur.status, "PARTIAL");
  assert.deepEqual(S.assignmentHeadOutstanding(cur).filter((h) => h.amount > 0), [{ head: "I term exam", amount: 700 }]);
  await collect(cur.id, [{ head: "I term exam", amount: 700 }]);
  assert.equal(cur.status, "PAID");
  assert.equal(S.assignmentBalance(cur), 0);
  assert.equal(cash(), 6000);
});

test("rejects over-collection, unknown heads, tampered totals and overpayment", async () => {
  const cur = await assignCurrent("s2");
  assert.match((await collect(cur.id, [{ head: "I unit test", amount: 301 }])).error ?? "", /exceeds/);
  assert.match((await collect(cur.id, [{ head: "Board exam fees", amount: 100 }])).error ?? "", /not charged/);
  // Tampered request: heads say 500 but amount says 100.
  const t = await A.collectFee(fd({ assignmentId: cur.id, amount: 100, mode: "CASH", accountId: "cash_inst_a", feeHeads: JSON.stringify([{ head: "Admission fee", amount: 500 }]) }));
  assert.match(t.error ?? "", /add up/);
  assert.match((await A.collectFee(fd({ assignmentId: cur.id, amount: 7000, mode: "CASH", accountId: "cash_inst_a", feeHeads: "[]" }))).error ?? "", /exceeds/);
  assert.match((await A.collectFee(fd({ assignmentId: cur.id, amount: -5, mode: "CASH", accountId: "cash_inst_a", feeHeads: "[]" }))).error ?? "", /./);
  assert.match((await A.collectFee(fd({ assignmentId: cur.id, amount: 100, mode: "CASH", accountId: "cash_inst_a", feeHeads: "not json" }))).error ?? "", /Invalid fee head/);
  assert.equal(store.feePayments.size, 0);
  assert.equal(cash(), 0);
});

test("payment date: backdated accepted, future and too-old rejected", async () => {
  const cur = await assignCurrent("s2");
  const r = await collect(cur.id, [{ head: "I unit test", amount: 100 }], { paidOn: daysAgo(3) });
  assert.equal(store.feePayments.get(r.paymentId!)!.paidAt.slice(0, 10), daysAgo(3));
  assert.match((await collect(cur.id, [{ head: "I unit test", amount: 100 }], { paidOn: daysAgo(-1) })).error ?? "", /future/);
  assert.match((await collect(cur.id, [{ head: "I unit test", amount: 100 }], { paidOn: daysAgo(400) })).error ?? "", /days old/);
  assert.ok((await collect(cur.id, [{ head: "I unit test", amount: 100 }], { paidOn: today })).paymentId);
});

test("cheque payments need cheque details; discount is not cash", async () => {
  const cur = await assignCurrent("s2");
  assert.match((await collect(cur.id, [{ head: "I unit test", amount: 300 }], { mode: "CHEQUE" })).error ?? "", /Cheque number/);
  const r = await collect(cur.id, [{ head: "Admission fee", amount: 1000 }], { discount: 200, discountReason: "Sibling" });
  assert.ok(r.paymentId, r.error);
  assert.equal(cash(), 800);
  assert.equal(S.assignmentBalance(cur), 5000);
});

// --- PDF 3: conditional TC fee ------------------------------------------------------

test("TC fee: add, block duplicates on every path, collect, block removal", async () => {
  const cur = await assignCurrent("s2");
  assert.equal((await A.addFeeCharge(fd({ assignmentId: cur.id, head: "TC fees", amount: 200, reason: "TC requested" })))?.error, undefined);
  assert.equal(S.assignmentBalance(cur), 6200);
  assert.match((await A.addFeeCharge(fd({ assignmentId: cur.id, head: "TC fees", amount: 200 })))?.error ?? "", /already charged/);
  // The bug found in manual testing: a second TC via "custom fees for this student".
  const dup = await A.setupStudentFees(fd({ studentId: "s2", mode: "CUSTOM", academicYearId: "ay_cur", items: "TC fees:200" }));
  assert.match(dup.error ?? "", /already charged/);
  // Same head twice in one custom entry is also refused.
  const twice = await A.setupStudentFees(fd({ studentId: "s1", mode: "CUSTOM", academicYearId: "ay_cur", items: "TC fees:200, TC fees:200" }));
  assert.match(twice.error ?? "", /already charged/);
  // A different year is fine.
  assert.ok((await A.setupStudentFees(fd({ studentId: "s2", mode: "CUSTOM", academicYearId: "ay_old", items: "TC fees:200" }))).assignmentId);

  await collect(cur.id, [{ head: "TC fees", amount: 200 }]);
  const chargeId = cur.extraItems![0].id;
  assert.match((await A.removeFeeCharge(fd({ assignmentId: cur.id, chargeId })))?.error ?? "", /already collected/);
});

test("removing an uncollected charge restores the balance; re-pricing keeps charges", async () => {
  const cur = await assignCurrent("s2");
  await A.addFeeCharge(fd({ assignmentId: cur.id, head: "Board exam fees", amount: 500 }));
  // Editing the structure must not wipe the student's extra charge.
  await A.updateStructure(fd({ id: "fs10", name: "Grade 10 Fees", totalAmount: 6500, classId: "c10", academicYearId: "ay_cur", items: "Admission fee:5500, I unit test:300, I term exam:700" }));
  assert.equal(cur.totalPayable, 7000);
  await A.removeFeeCharge(fd({ assignmentId: cur.id, chargeId: cur.extraItems![0].id }));
  assert.equal(cur.totalPayable, 6500);
  assert.equal(cur.extraItems!.length, 0);
});

test("custom head needs a reason", async () => {
  const cur = await assignCurrent("s2");
  assert.match((await A.addFeeCharge(fd({ assignmentId: cur.id, head: "Bus fine", amount: 50 })))?.error ?? "", /reason/);
  assert.equal((await A.addFeeCharge(fd({ assignmentId: cur.id, head: "Bus fine", amount: 50, reason: "Lost pass" })))?.error, undefined);
});

// --- PDF 6: audit, edit, reversal ---------------------------------------------------

test("edit keeps history and never changes the amount", async () => {
  const cur = await assignCurrent("s2");
  const { paymentId } = await collect(cur.id, [{ head: "Admission fee", amount: 1000 }]);
  await A.updatePayment(fd({ paymentId: paymentId!, amount: 99999, mode: "UPI", reference: "UTR1", reason: "Wrong mode" }));
  const p = store.feePayments.get(paymentId!)!;
  assert.equal(p.amount, 1000);
  assert.equal(p.mode, "UPI");
  assert.equal(p.history?.[0].mode, "CASH");
  assert.equal(cur.totalPaid, 1000);
  assert.ok(store.auditLogs.some((l) => l.action === "fee.payment_update"));
});

test("reversal restores balance, debits the account, keeps the record, and is one-time", async () => {
  const cur = await assignCurrent("s2");
  const { paymentId } = await collect(cur.id, [{ head: "Admission fee", amount: 1000 }]);
  assert.match((await A.reversePayment(fd({ paymentId: paymentId!, reason: "" })))?.error ?? "", /reason/);
  assert.equal((await A.reversePayment(fd({ paymentId: paymentId!, reason: "Cheque bounced" })))?.error, undefined);

  const p = store.feePayments.get(paymentId!)!;
  assert.ok(p.voidedAt);
  assert.equal(cur.totalPaid, 0);
  assert.equal(cur.status, "PENDING");
  assert.equal(cash(), 0);
  assert.ok(Array.from(store.transactions.values()).some((t) => t.direction === "DEBIT" && t.amount === 1000));
  // The reversed head is owed again and can be collected.
  assert.equal(S.assignmentHeadOutstanding(cur).find((h) => h.head === "Admission fee")!.amount, 5000);
  assert.match((await A.reversePayment(fd({ paymentId: paymentId!, reason: "again" })))?.error ?? "", /already reversed/);
  assert.match((await A.updatePayment(fd({ paymentId: paymentId!, mode: "UPI" })))?.error ?? "", /reversed/);
});

test("reversing a discount-only receipt adjusts the discount, not cash", async () => {
  const cur = await assignCurrent("s2");
  const { paymentId } = await collect(cur.id, [{ head: "I unit test", amount: 300 }], { discount: 300, discountReason: "Staff ward" });
  assert.equal(cur.collectionDiscount, 300);
  await A.reversePayment(fd({ paymentId: paymentId!, reason: "Not approved" }));
  assert.equal(cur.collectionDiscount, 0);
  assert.equal(cash(), 0);
  assert.equal(Array.from(store.transactions.values()).length, 0);
});

test("a carried-forward year is frozen: no reversal, no new charges", async () => {
  const oldId = await setupOldYear();
  const { paymentId } = await collect(oldId, [{ head: "Tuition fee", amount: 400 }]);
  await assignCurrent();
  assert.match((await A.reversePayment(fd({ paymentId: paymentId!, reason: "test" })))?.error ?? "", /carried forward/);
  assert.match((await A.addFeeCharge(fd({ assignmentId: oldId, head: "TC fees", amount: 200 })))?.error ?? "", /closed/);
});

// --- Security: roles and tenant isolation -------------------------------------------

test("cashier can collect and edit but cannot reverse or change charges; viewer cannot collect", async () => {
  const cur = await assignCurrent("s2");
  currentUser = cashier;
  const { paymentId } = await collect(cur.id, [{ head: "Admission fee", amount: 500 }]);
  assert.ok(paymentId);
  assert.match((await A.reversePayment(fd({ paymentId: paymentId!, reason: "test" })))?.error ?? "", /Not authorized/);
  assert.match((await A.addFeeCharge(fd({ assignmentId: cur.id, head: "TC fees", amount: 200 })))?.error ?? "", /Not authorized/);
  currentUser = viewer;
  assert.match((await collect(cur.id, [{ head: "Admission fee", amount: 500 }])).error ?? "", /Not authorized/);
});

test("another school cannot touch this school's fees, receipts or accounts", async () => {
  const cur = await assignCurrent("s2");
  const { paymentId } = await collect(cur.id, [{ head: "Admission fee", amount: 500 }]);
  currentUser = otherSchool;
  assert.match((await collect(cur.id, [{ head: "Admission fee", amount: 100 }], { accountId: "cash_inst_b" })).error ?? "", /not found/);
  assert.match((await A.reversePayment(fd({ paymentId: paymentId!, reason: "hack" })))?.error ?? "", /not found/);
  assert.match((await A.updatePayment(fd({ paymentId: paymentId!, mode: "UPI" })))?.error ?? "", /not found/);
  assert.match((await A.addFeeCharge(fd({ assignmentId: cur.id, head: "TC fees", amount: 1 })))?.error ?? "", /not found/);
  // Using this school's assignment with the other school's account is refused too.
  currentUser = admin;
  assert.match((await collect(cur.id, [{ head: "Admission fee", amount: 100 }], { accountId: "cash_inst_b" })).error ?? "", /Invalid account/);
});

test("every money-changing action is audit logged", async () => {
  const cur = await assignCurrent("s2");
  const { paymentId } = await collect(cur.id, [{ head: "Admission fee", amount: 500 }]);
  await A.addFeeCharge(fd({ assignmentId: cur.id, head: "TC fees", amount: 200 }));
  await A.reversePayment(fd({ paymentId: paymentId!, reason: "test" }));
  const actions = store.auditLogs.map((l) => l.action);
  for (const a of ["fee.collect", "fee_charge.add", "fee.payment_reverse"]) assert.ok(actions.includes(a), a);
});
