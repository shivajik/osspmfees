"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole, type Permission } from "@/lib/auth/rbac";
import { pushAudit, store } from "@/lib/db/store";
import { saveStore } from "@/lib/db/persistence";

const DELETABLE = [
  "class",
  "batch",
  "academicYear",
  "student",
  "feeStructure",
  "feeAssignment",
  "account",
  "expense",
  "expenseCategory",
] as const;
export type DeletableKind = (typeof DELETABLE)[number];

const schema = z.object({
  kind: z.enum(DELETABLE),
  id: z.string().min(1),
});

const PERM: Record<DeletableKind, Permission> = {
  class: PERMISSIONS.CLASS_WRITE,
  batch: PERMISSIONS.BATCH_WRITE,
  academicYear: PERMISSIONS.ACADEMIC_YEAR_WRITE,
  student: PERMISSIONS.STUDENT_WRITE,
  feeStructure: PERMISSIONS.FEE_STRUCTURE_WRITE,
  feeAssignment: PERMISSIONS.FEE_STRUCTURE_WRITE,
  account: PERMISSIONS.BANK_WRITE,
  expense: PERMISSIONS.EXPENSE_WRITE,
  expenseCategory: PERMISSIONS.EXPENSE_WRITE,
};

const ENTITY: Record<DeletableKind, string> = {
  class: "Class",
  batch: "Batch",
  academicYear: "AcademicYear",
  student: "Student",
  feeStructure: "FeeStructure",
  feeAssignment: "FeeAssignment",
  account: "Account",
  expense: "Expense",
  expenseCategory: "ExpenseCategory",
};

/** Human-readable "still in use" message, or null when the record is safe to delete. */
function blockedBy(kind: DeletableKind, id: string, instituteId: string): string | null {
  const inScope = <T extends { instituteId: string }>(rows: Iterable<T>) =>
    Array.from(rows).filter((r) => r.instituteId === instituteId);

  const students = inScope(store.students.values());
  const batches = inScope(store.batches.values());
  const structures = inScope(store.feeStructures.values());
  const assignments = inScope(store.feeAssignments.values());
  const payments = inScope(store.feePayments.values());
  const expenses = inScope(store.expenses.values());
  const transactions = inScope(store.transactions.values());

  const used = (n: number, what: string, how: string) =>
    n > 0 ? `Cannot delete — ${n} ${what}${n === 1 ? "" : "s"} ${how}. Remove or reassign ${n === 1 ? "it" : "them"} first.` : null;

  switch (kind) {
    case "class":
      return (
        used(students.filter((s) => s.classId === id).length, "student", "is enrolled in this class") ??
        used(batches.filter((b) => b.classId === id).length, "division", "belongs to this class") ??
        used(structures.filter((f) => f.classId === id).length, "fee structure", "is defined for this class")
      );
    case "batch":
      return used(students.filter((s) => s.batchId === id).length, "student", "is assigned to this division");
    case "academicYear":
      return (
        used(students.filter((s) => s.academicYearId === id).length, "student", "is enrolled in this academic year") ??
        used(batches.filter((b) => b.academicYearId === id).length, "division", "belongs to this academic year") ??
        used(structures.filter((f) => f.academicYearId === id).length, "fee structure", "is defined for this academic year") ??
        used(assignments.filter((a) => a.academicYearId === id).length, "fee assignment", "belongs to this academic year")
      );
    case "student": {
      const paid = payments.filter((p) => p.studentId === id).length;
      if (paid > 0) {
        return `Cannot delete — this student has ${paid} fee receipt${paid === 1 ? "" : "s"}. Receipts are permanent records; set the student to Inactive instead.`;
      }
      return null;
    }
    case "feeStructure": {
      const assigned = assignments.filter((a) => a.feeStructureId === id);
      if (assigned.length > 0) {
        const names = assigned
          .slice(0, 3)
          .map((a) => store.students.get(a.studentId)?.name ?? "a student")
          .join(", ");
        const more = assigned.length > 3 ? ` and ${assigned.length - 3} more` : "";
        return `Cannot delete — this fee structure is assigned to ${assigned.length} student${assigned.length === 1 ? "" : "s"} (${names}${more}). Remove those assignments first.`;
      }
      return null;
    }
    case "feeAssignment": {
      const receipts = payments.filter((p) => p.assignmentId === id).length;
      if (receipts > 0) {
        return `Cannot delete — ${receipts} payment receipt${receipts === 1 ? " has" : "s have"} been issued against this assignment.`;
      }
      const assn = store.feeAssignments.get(id);
      if (assn?.carriedForwardTo) {
        return "Cannot delete — this assignment's balance was carried forward to a later year. Delete the newer assignment first.";
      }
      return null;
    }
    case "account":
      return used(transactions.filter((t) => t.accountId === id).length, "ledger transaction", "is recorded on this account");
    case "expenseCategory":
      return used(expenses.filter((e) => e.categoryId === id).length, "expense", "is filed under this category");
    case "expense":
      return null;
  }
}

export async function deleteRecord(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Invalid delete request" };
  const { kind, id } = parsed.data;

  if (!hasPermission(permissionsForRole(user.role), PERM[kind])) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };

  const maps: Record<DeletableKind, Map<string, { id: string; instituteId: string }>> = {
    class: store.classes,
    batch: store.batches,
    academicYear: store.academicYears,
    student: store.students,
    feeStructure: store.feeStructures,
    feeAssignment: store.feeAssignments,
    account: store.accounts,
    expense: store.expenses,
    expenseCategory: store.expenseCategories,
  };

  const map = maps[kind];
  const record = map.get(id);
  if (!record || record.instituteId !== user.instituteId) return { error: "Record not found" };

  const blocked = blockedBy(kind, id, user.instituteId);
  if (blocked) return { error: blocked };

  // Cascading side effects that are always safe (no receipts exist at this point).
  if (kind === "student") {
    for (const a of Array.from(store.feeAssignments.values())) {
      if (a.studentId === id) store.feeAssignments.delete(a.id);
    }
  }
  if (kind === "expense") {
    const exp = store.expenses.get(id);
    if (exp?.accountId) {
      const acc = store.accounts.get(exp.accountId);
      if (acc) acc.currentBal += exp.amount;
      for (const t of Array.from(store.transactions.values())) {
        if (t.expenseId === id) store.transactions.delete(t.id);
      }
    }
  }
  if (kind === "feeAssignment") {
    const assn = store.feeAssignments.get(id);
    for (const prior of store.feeAssignments.values()) {
      if (prior.carriedForwardTo === assn?.id) prior.carriedForwardTo = undefined;
    }
  }

  map.delete(id);

  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: `${kind}.delete`, entity: ENTITY[kind], entityId: id, meta: {},
  });
  await saveStore();
}
