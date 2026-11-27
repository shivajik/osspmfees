import {
  assignmentFees,
  assignmentHeadOutstanding,
  assignmentPayments,
  assignmentYearId,
  previousDue,
  store,
  type FeeAssignment,
} from "@/lib/db/store";
import { PREVIOUS_BALANCE_HEAD } from "@/lib/fees/rules";

/** Receipts recorded without a per-head split (older data) land here. */
export const UNALLOCATED_HEAD = "Unallocated";
const OTHER_HEAD = "Other fees";

export interface StudentHeadRow {
  id: string;
  instituteId: string;
  classId: string;
  className: string;
  adm: string;
  name: string;
  /** Fees charged for the year(s), after discount. */
  payable: number;
  received: number;
  balance: number;
  /** Charged per head (before discount). */
  chargedByHead: Record<string, number>;
  receivedByHead: Record<string, number>;
  pendingByHead: Record<string, number>;
}

export interface FeeReportFilter {
  classId?: string;
  yearId?: string;
}

const add = (m: Record<string, number>, k: string, v: number) => {
  if (v) m[k] = (m[k] ?? 0) + v;
};

/** Natural class order: "class 8" before "class 10". */
export const compareClassNames = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

export function filterAssignments(assignments: FeeAssignment[], f: FeeReportFilter): FeeAssignment[] {
  return assignments.filter((a) => {
    if (f.yearId && assignmentYearId(a) !== f.yearId) return false;
    if (f.classId && store.students.get(a.studentId)?.classId !== f.classId) return false;
    return true;
  });
}

/**
 * One row per student with charged / received / pending amounts split by fee
 * head — the basis of the class-wise, student-wise and head-wise reports.
 */
export function studentHeadRows(assignments: FeeAssignment[]): { heads: string[]; rows: StudentHeadRow[] } {
  const byStudent = new Map<string, StudentHeadRow>();
  const headOrder: string[] = [];
  const seeHead = (h: string) => { if (!headOrder.includes(h)) headOrder.push(h); };

  for (const a of assignments) {
    const s = store.students.get(a.studentId);
    const cls = s ? store.classes.get(s.classId) : undefined;
    const row = byStudent.get(a.studentId) ?? {
      id: a.studentId,
      instituteId: a.instituteId,
      classId: s?.classId ?? "",
      className: cls?.name ?? "—",
      adm: s?.admissionNo ?? "",
      name: s?.name ?? a.studentId,
      payable: 0, received: 0, balance: 0,
      chargedByHead: {}, receivedByHead: {}, pendingByHead: {},
    };
    byStudent.set(a.studentId, row);

    row.payable += a.totalPayable;
    row.received += a.totalPaid;

    // Charged heads (structure / custom / extra), with any un-itemised remainder.
    const fees = assignmentFees(a);
    for (const i of fees.items) { seeHead(i.head); add(row.chargedByHead, i.head, i.amount); }
    const residual = fees.totalAmount - fees.items.reduce((sum, i) => sum + i.amount, 0);
    if (residual > 0) { seeHead(OTHER_HEAD); add(row.chargedByHead, OTHER_HEAD, residual); }

    // Received per head from each active receipt's breakup.
    for (const p of assignmentPayments(a.id)) {
      const breakup = p.feeHeadBreakup ?? [];
      const allocated = breakup.reduce((sum, h) => sum + h.amount, 0);
      for (const h of breakup) { seeHead(h.head); add(row.receivedByHead, h.head, h.amount); }
      const rest = p.amount - allocated;
      if (rest > 0) { seeHead(UNALLOCATED_HEAD); add(row.receivedByHead, UNALLOCATED_HEAD, rest); }
    }

    // Pending per head — carried-forward years owe nothing here (their dues
    // moved to the newer year's previous balance).
    if (!a.carriedForwardTo) {
      if (previousDue(a) > 0) seeHead(PREVIOUS_BALANCE_HEAD);
      for (const h of assignmentHeadOutstanding(a)) { seeHead(h.head); add(row.pendingByHead, h.head, h.amount); }
    }
  }

  for (const r of byStudent.values()) r.balance = Math.max(0, r.payable - r.received);

  const rank = (h: string) => (h === PREVIOUS_BALANCE_HEAD ? 0 : h === OTHER_HEAD ? 2 : h === UNALLOCATED_HEAD ? 3 : 1);
  const heads = headOrder
    .map((h, i) => ({ h, i }))
    .sort((x, y) => rank(x.h) - rank(y.h) || x.i - y.i)
    .map((x) => x.h);

  const rows = Array.from(byStudent.values()).sort(
    (a, b) => compareClassNames(a.className, b.className) || a.name.localeCompare(b.name),
  );
  return { heads, rows };
}

export interface ClassRow {
  id: string;
  instituteId: string;
  className: string;
  students: number;
  pendingStudents: number;
  payable: number;
  received: number;
  balance: number;
  pendingByHead: Record<string, number>;
}

export function classRows(rows: StudentHeadRow[], splitByInstitute: boolean): ClassRow[] {
  const map = new Map<string, ClassRow>();
  for (const r of rows) {
    const key = splitByInstitute ? `${r.classId}|${r.instituteId}` : r.classId;
    const c = map.get(key) ?? {
      id: key, instituteId: r.instituteId, className: r.className,
      students: 0, pendingStudents: 0, payable: 0, received: 0, balance: 0, pendingByHead: {},
    };
    c.students += 1;
    if (r.balance > 0) c.pendingStudents += 1;
    c.payable += r.payable; c.received += r.received; c.balance += r.balance;
    for (const [h, v] of Object.entries(r.pendingByHead)) add(c.pendingByHead, h, v);
    map.set(key, c);
  }
  return Array.from(map.values()).sort((a, b) => compareClassNames(a.className, b.className));
}

export interface HeadRow { head: string; charged: number; received: number; pending: number; students: number }

export function headRows(heads: string[], rows: StudentHeadRow[]): HeadRow[] {
  return heads.map((head) => {
    let charged = 0, received = 0, pending = 0, students = 0;
    for (const r of rows) {
      charged += r.chargedByHead[head] ?? 0;
      received += r.receivedByHead[head] ?? 0;
      const p = r.pendingByHead[head] ?? 0;
      pending += p;
      if (p > 0) students += 1;
    }
    if (head === PREVIOUS_BALANCE_HEAD) charged = received + pending;
    return { head, charged, received, pending, students };
  });
}
