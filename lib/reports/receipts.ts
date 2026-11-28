import { isActivePayment, scopeByInstitute, store } from "@/lib/db/store";

export interface ReceiptRow {
  id: string;
  instituteId: string;
  classId: string;
  date: string;
  receiptNo: string;
  student: string;
  adm: string;
  className: string;
  heads: string;
  mode: string;
  discount: number;
  amount: number;
  collectedBy: string;
}

/** Today's date (YYYY-MM-DD) in India time — the default report day. */
export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

/**
 * One row per active receipt between `from` and `to` (inclusive, YYYY-MM-DD),
 * newest first: who paid, receipt number, heads, mode and who collected it.
 */
export function receiptRows(scope: string | null, from: string, to: string, classId = ""): ReceiptRow[] {
  return scopeByInstitute(store.feePayments.values(), scope)
    .filter(isActivePayment)
    .filter((p) => {
      const d = p.paidAt.slice(0, 10);
      return (!from || d >= from) && (!to || d <= to);
    })
    .map((p) => {
      const s = store.students.get(p.studentId);
      const u = store.users.get(p.createdBy);
      const name = p.createdByName || u?.name || "";
      return {
        id: p.id,
        instituteId: p.instituteId,
        classId: s?.classId ?? "",
        date: p.paidAt.slice(0, 10),
        receiptNo: p.receiptNo,
        student: s?.name ?? "—",
        adm: s?.admissionNo ?? "",
        className: s ? store.classes.get(s.classId)?.name ?? "" : "",
        heads: (p.feeHeadBreakup?.length
          ? p.feeHeadBreakup.map((h) => `${h.head} ${h.amount}`)
          : [p.feeHead || "Fee"]).join(", "),
        mode: p.mode,
        discount: p.discount ?? 0,
        amount: p.amount,
        collectedBy: u?.role ? `${name} (${u.role.replace("_", " ")})` : name,
      };
    })
    .filter((r) => !classId || r.classId === classId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.receiptNo.localeCompare(a.receiptNo, undefined, { numeric: true }));
}
