/**
 * The school's sample report: Yogesh (8), Sohale (9), Nilesh (10) with
 * admission / unit / term / board-exam heads, received and balance per student.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { store, type FeeAssignment } from "@/lib/db/store";
import { classRows, headRows, studentHeadRows, UNALLOCATED_HEAD } from "@/lib/reports/fee-heads";

const INST = "inst_test";
const now = "2026-10-24T00:00:00.000Z";

function student(id: string, name: string, classId: string, className: string) {
  store.classes.set(classId, { id: classId, instituteId: INST, name: className, createdAt: now });
  store.students.set(id, {
    id, instituteId: INST, admissionNo: id, name, classId, batchId: "b", academicYearId: "ay", status: "ACTIVE", createdAt: now,
  });
}

function assign(id: string, studentId: string, items: { head: string; amount: number }[], paid: { head: string; amount: number }[]) {
  const totalPayable = items.reduce((s, i) => s + i.amount, 0);
  const totalPaid = paid.reduce((s, i) => s + i.amount, 0);
  const a: FeeAssignment = {
    id, instituteId: INST, studentId, feeStructureId: "", customItems: items, academicYearId: "ay",
    discount: 0, totalPayable, totalPaid, status: "PARTIAL", createdAt: now,
  };
  store.feeAssignments.set(id, a);
  store.feePayments.set(`p_${id}`, {
    id: `p_${id}`, instituteId: INST, assignmentId: id, studentId, receiptNo: id, amount: totalPaid, mode: "CASH",
    feeHeadBreakup: paid.filter((p) => p.head !== UNALLOCATED_HEAD), paidAt: now, createdBy: "u", createdByName: "U",
  });
  return a;
}

beforeEach(() => {
  store.students.clear(); store.classes.clear();
  store.feeStructures.clear(); store.feeAssignments.clear(); store.feePayments.clear();
});

test("student, class and head-wise figures match the sample sheet", () => {
  student("s1", "YOGESH", "c8", "8");
  student("s2", "SOHALE", "c9", "9");
  student("s3", "NILESH", "c10", "10");
  assign("a1", "s1",
    [{ head: "Admission fees", amount: 300 }, { head: "I Unit", amount: 200 }, { head: "I Term", amount: 200 }],
    [{ head: "Admission fees", amount: 300 }, { head: "I Unit", amount: 100 }, { head: "I Term", amount: 100 }]);
  assign("a2", "s2",
    [{ head: "I Unit", amount: 200 }, { head: "I Term", amount: 200 }],
    [{ head: "I Unit", amount: 100 }, { head: "I Term", amount: 100 }]);
  assign("a3", "s3",
    [{ head: "I Unit", amount: 300 }, { head: "I Term", amount: 300 }, { head: "Board exam", amount: 1000 }],
    [{ head: "I Unit", amount: 100 }, { head: "I Term", amount: 100 }, { head: "Board exam", amount: 1000 }]);

  const { heads, rows } = studentHeadRows(Array.from(store.feeAssignments.values()));
  assert.deepEqual(rows.map((r) => [r.className, r.name, r.payable, r.received, r.balance]), [
    ["8", "YOGESH", 700, 500, 200],
    ["9", "SOHALE", 400, 200, 200],
    ["10", "NILESH", 1600, 1200, 400],
  ]);
  assert.deepEqual(rows[2].pendingByHead, { "I Unit": 200, "I Term": 200 });

  const byHead = Object.fromEntries(headRows(heads, rows).map((h) => [h.head, [h.received, h.pending]]));
  assert.deepEqual(byHead, {
    "Admission fees": [300, 0], "I Unit": [300, 400], "I Term": [300, 400], "Board exam": [1000, 0],
  });

  const cls = classRows(rows, false);
  assert.equal(cls.reduce((s, c) => s + c.balance, 0), 800);
  assert.equal(cls.reduce((s, c) => s + c.received, 0), 1900);
});

test("receipts without a head split show as Unallocated", () => {
  student("s1", "A", "c8", "8");
  assign("a1", "s1", [{ head: "Tuition", amount: 1000 }], [{ head: UNALLOCATED_HEAD, amount: 400 }]);
  const { rows } = studentHeadRows(Array.from(store.feeAssignments.values()));
  assert.equal(rows[0].receivedByHead[UNALLOCATED_HEAD], 400);
  assert.equal(rows[0].balance, 600);
});
