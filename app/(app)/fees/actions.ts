"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { pushAudit, store, nextReceiptNo } from "@/lib/db/store";
import { uid } from "@/lib/utils";

const collectSchema = z.object({
  assignmentId: z.string().min(1),
  amount: z.coerce.number().int().positive().max(10_000_000),
  mode: z.enum(["CASH", "BANK", "CARD", "UPI", "CHEQUE", "ONLINE"]),
  accountId: z.string().min(1),
  reference: z.string().max(80).optional().or(z.literal("")),
});

export async function collectFee(fd: FormData): Promise<{ error?: string; paymentId?: string }> {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.FEE_COLLECT)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };

  const parsed = collectSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };
  const { assignmentId, amount, mode, accountId, reference } = parsed.data;

  const assn = store.feeAssignments.get(assignmentId);
  if (!assn || assn.instituteId !== user.instituteId) return { error: "Assignment not found" };
  const account = store.accounts.get(accountId);
  if (!account || account.instituteId !== user.instituteId) return { error: "Invalid account" };
  const balance = assn.totalPayable - assn.totalPaid;
  if (amount > balance) return { error: "Amount exceeds outstanding balance" };

  const now = new Date().toISOString();
  const paymentId = uid("pay");
  const receiptNo = nextReceiptNo();

  store.feePayments.set(paymentId, {
    id: paymentId, instituteId: user.instituteId,
    assignmentId, studentId: assn.studentId,
    receiptNo, amount, mode, accountId,
    reference: reference || undefined, paidAt: now,
    createdBy: user.id, createdByName: user.name,
  });

  assn.totalPaid += amount;
  assn.status = assn.totalPaid >= assn.totalPayable ? "PAID" : "PARTIAL";

  account.currentBal += amount;
  const txnId = uid("txn");
  store.transactions.set(txnId, {
    id: txnId, instituteId: user.instituteId, accountId,
    direction: "CREDIT", amount, balanceAfter: account.currentBal,
    reference: `Fee ${receiptNo}`, paymentId, occurredAt: now, createdAt: now,
  });

  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "fee.collect", entity: "FeePayment", entityId: paymentId,
    meta: { amount, mode, receiptNo },
  });
  return { paymentId };
}

const structureSchema = z.object({
  name: z.string().min(2).max(120),
  totalAmount: z.coerce.number().int().positive().max(10_000_000),
  classId: z.string().min(1),
  academicYearId: z.string().min(1),
  items: z.string().max(500).optional().or(z.literal("")),
});

export async function createStructure(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.FEE_STRUCTURE_WRITE)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };

  const parsed = structureSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };

  const cls = store.classes.get(parsed.data.classId);
  const ay = store.academicYears.get(parsed.data.academicYearId);
  if (!cls || cls.instituteId !== user.instituteId) return { error: "Invalid class" };
  if (!ay || ay.instituteId !== user.instituteId) return { error: "Invalid year" };

  const items = (parsed.data.items || "")
    .split(",").map((p) => p.trim()).filter(Boolean)
    .map((p) => {
      const [head, amt] = p.split(":").map((x) => x.trim());
      return { head: head || "Head", amount: Math.max(0, Number(amt) || 0) };
    });

  const id = uid("fs");
  store.feeStructures.set(id, {
    id, instituteId: user.instituteId,
    academicYearId: parsed.data.academicYearId, classId: parsed.data.classId,
    name: parsed.data.name, totalAmount: parsed.data.totalAmount,
    items: items.length ? items : [{ head: "Tuition", amount: parsed.data.totalAmount }],
    createdAt: new Date().toISOString(),
  });

  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "fee_structure.create", entity: "FeeStructure", entityId: id,
    meta: { name: parsed.data.name, totalAmount: parsed.data.totalAmount },
  });
}
