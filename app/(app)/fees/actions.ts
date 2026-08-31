"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import {
  pushAudit, store, nextReceiptNo,
  assignmentYearId, grossPayable, assignmentBalance, assignmentStatusFor, openPriorAssignments,
  type ChequeDetails,
} from "@/lib/db/store";
import { uid } from "@/lib/utils";
import { saveStore } from "@/lib/db/persistence";

const chequeFields = {
  chequeNo: z.string().max(40).optional().or(z.literal("")),
  chequeDate: z.string().max(30).optional().or(z.literal("")),
  chequeBank: z.string().max(80).optional().or(z.literal("")),
  chequeBranch: z.string().max(80).optional().or(z.literal("")),
};

function buildCheque(
  mode: string,
  d: { chequeNo?: string; chequeDate?: string; chequeBank?: string; chequeBranch?: string },
): { cheque?: ChequeDetails; error?: string } {
  if (mode !== "CHEQUE") return {};
  if (!d.chequeNo || !d.chequeDate || !d.chequeBank) {
    return { error: "Cheque number, cheque date and bank name are required for cheque payments" };
  }
  return {
    cheque: {
      chequeNo: d.chequeNo,
      chequeDate: new Date(d.chequeDate).toISOString(),
      bankName: d.chequeBank,
      branch: d.chequeBranch || undefined,
    },
  };
}

const collectSchema = z.object({
  assignmentId: z.string().min(1),
  amount: z.coerce.number().int().min(0).max(10_000_000),
  discount: z.coerce.number().int().min(0).max(10_000_000).optional().default(0),
  discountReason: z.string().max(160).optional().or(z.literal("")),
  mode: z.enum(["CASH", "BANK", "CARD", "UPI", "CHEQUE", "ONLINE"]),
  accountId: z.string().min(1),
  feeHead: z.string().max(300).optional().or(z.literal("")),
  feeHeads: z.string().max(2000).optional().or(z.literal("")),
  reference: z.string().max(80).optional().or(z.literal("")),
  ...chequeFields,
});

export async function collectFee(fd: FormData): Promise<{ error?: string; paymentId?: string }> {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.FEE_COLLECT)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };

  const parsed = collectSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };
  const { assignmentId, amount, discount, discountReason, mode, accountId, reference, feeHead } = parsed.data;
  if (amount + discount <= 0) return { error: "Enter an amount received or a discount" };

  const assn = store.feeAssignments.get(assignmentId);
  if (!assn || assn.instituteId !== user.instituteId) return { error: "Assignment not found" };
  if (assn.carriedForwardTo) return { error: "This year's balance was carried forward — collect on the latest year." };
  const account = store.accounts.get(accountId);
  if (!account || account.instituteId !== user.instituteId) return { error: "Invalid account" };
  const balance = assignmentBalance(assn);
  if (amount + discount > balance) return { error: "Amount plus discount exceeds the outstanding balance" };

  const cq = buildCheque(mode, parsed.data);
  if (cq.error) return { error: cq.error };

  // Optional per-head split — must add up to what this payment settles.
  let feeHeadBreakup: { head: string; amount: number }[] | undefined;
  if (parsed.data.feeHeads) {
    try {
      const raw = JSON.parse(parsed.data.feeHeads) as { head?: unknown; amount?: unknown }[];
      feeHeadBreakup = (Array.isArray(raw) ? raw : [])
        .map((r) => ({ head: String(r.head ?? "").slice(0, 60), amount: Math.max(0, Math.round(Number(r.amount) || 0)) }))
        .filter((r) => r.head && r.amount > 0);
    } catch {
      return { error: "Invalid fee head selection" };
    }
  }
  if (!feeHeadBreakup?.length) return { error: "Select at least one fee head for this payment" };
  const headsTotal = feeHeadBreakup.reduce((s, h) => s + h.amount, 0);
  if (headsTotal !== amount + discount) {
    return { error: `Fee head amounts add up to ₹${headsTotal.toLocaleString("en-IN")} but this payment settles ₹${(amount + discount).toLocaleString("en-IN")}. Adjust the head amounts so both match.` };
  }

  const now = new Date().toISOString();
  const paymentId = uid("pay");
  const receiptNo = nextReceiptNo();

  // Payments (and counter discounts) settle carried-forward previous balance
  // first, then the current year's fees.
  const prevDue = Math.max(0, (assn.previousBalance ?? 0) - assn.totalPaid);
  const settled = amount + discount;
  const appliedToPrevious = Math.min(settled, prevDue);
  const appliedToCurrent = settled - appliedToPrevious;

  store.feePayments.set(paymentId, {
    id: paymentId, instituteId: user.instituteId,
    assignmentId, studentId: assn.studentId,
    receiptNo, amount, mode, accountId,
    feeHead: feeHead || feeHeadBreakup.map((h) => h.head).join(", "),
    feeHeadBreakup,
    appliedToPrevious, appliedToCurrent,
    discount: discount > 0 ? discount : undefined,
    discountBy: discount > 0 ? user.id : undefined,
    discountByName: discount > 0 ? user.name : undefined,
    discountReason: discount > 0 ? (discountReason || undefined) : undefined,
    cheque: cq.cheque,
    reference: reference || undefined, paidAt: now,
    createdBy: user.id, createdByName: user.name,
  });

  assn.totalPaid += settled;
  if (discount > 0) assn.collectionDiscount = (assn.collectionDiscount ?? 0) + discount;
  assn.status = assignmentStatusFor(assn);
  assn.updatedAt = now;

  // Only real money hits the account ledger — discounts never do.
  if (amount > 0) {
    account.currentBal += amount;
    const txnId = uid("txn");
    store.transactions.set(txnId, {
      id: txnId, instituteId: user.instituteId, accountId,
      direction: "CREDIT", amount, balanceAfter: account.currentBal,
      reference: `Fee ${receiptNo}`, paymentId, occurredAt: now, createdAt: now,
    });
  }

  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "fee.collect", entity: "FeePayment", entityId: paymentId,
    meta: { amount, discount, discountReason: discountReason || null, mode, feeHead: feeHead ?? null, receiptNo, appliedToPrevious, appliedToCurrent },
  });
  await saveStore();
  return { paymentId };
}

const editPaymentSchema = z.object({
  paymentId: z.string().min(1),
  amount: z.coerce.number().int().positive().max(10_000_000),
  mode: z.enum(["CASH", "BANK", "CARD", "UPI", "CHEQUE", "ONLINE"]),
  reference: z.string().max(80).optional().or(z.literal("")),
  ...chequeFields,
});

export async function updatePayment(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.FEE_COLLECT)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };

  const parsed = editPaymentSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };
  const { paymentId, amount, mode, reference } = parsed.data;

  const pay = store.feePayments.get(paymentId);
  if (!pay || pay.instituteId !== user.instituteId) return { error: "Payment not found" };
  const assn = store.feeAssignments.get(pay.assignmentId);
  if (!assn) return { error: "Assignment not found" };

  const cq = buildCheque(mode, parsed.data);
  if (cq.error) return { error: cq.error };

  const delta = amount - pay.amount;
  const newPaid = assn.totalPaid + delta;
  if (newPaid < 0) return { error: "Amount too low" };
  if (newPaid > grossPayable(assn)) return { error: "Amount exceeds total payable for this assignment" };

  const now = new Date().toISOString();
  if (delta !== 0 && pay.accountId) {
    const acc = store.accounts.get(pay.accountId);
    if (acc) {
      acc.currentBal += delta;
      const txnId = uid("txn");
      store.transactions.set(txnId, {
        id: txnId, instituteId: user.instituteId, accountId: acc.id,
        direction: delta > 0 ? "CREDIT" : "DEBIT", amount: Math.abs(delta),
        balanceAfter: acc.currentBal, reference: `Adjustment ${pay.receiptNo}`,
        paymentId: pay.id, occurredAt: now, createdAt: now,
      });
    }
  }

  const settledOther = assn.totalPaid - pay.amount - (pay.discount ?? 0);
  const prevDue = Math.max(0, (assn.previousBalance ?? 0) - settledOther);
  pay.amount = amount;
  pay.mode = mode;
  pay.reference = reference || undefined;
  pay.cheque = cq.cheque;
  pay.appliedToPrevious = Math.min(amount + (pay.discount ?? 0), prevDue);
  pay.appliedToCurrent = amount + (pay.discount ?? 0) - pay.appliedToPrevious;
  pay.updatedAt = now;
  pay.updatedBy = user.id;
  pay.updatedByName = user.name;

  assn.totalPaid = newPaid;
  assn.status = assignmentStatusFor(assn);
  assn.updatedAt = now;

  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "fee.payment_update", entity: "FeePayment", entityId: pay.id,
    meta: { amount, delta, mode },
  });
  await saveStore();
}

const structureSchema = z.object({
  name: z.string().min(2).max(120),
  totalAmount: z.coerce.number().int().positive().max(10_000_000),
  classId: z.string().min(1),
  academicYearId: z.string().min(1),
  items: z.string().max(500).optional().or(z.literal("")),
});

function parseItems(raw: string | undefined, total: number) {
  const items = (raw || "")
    .split(",").map((p) => p.trim()).filter(Boolean)
    .map((p) => {
      const [head, amt] = p.split(":").map((x) => x.trim());
      return { head: head || "Head", amount: Math.max(0, Number(amt) || 0) };
    });
  return items.length ? items : [{ head: "Tuition", amount: total }];
}

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

  const id = uid("fs");
  store.feeStructures.set(id, {
    id, instituteId: user.instituteId,
    academicYearId: parsed.data.academicYearId, classId: parsed.data.classId,
    name: parsed.data.name, totalAmount: parsed.data.totalAmount,
    items: parseItems(parsed.data.items, parsed.data.totalAmount),
    createdAt: new Date().toISOString(),
  });

  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "fee_structure.create", entity: "FeeStructure", entityId: id,
    meta: { name: parsed.data.name, totalAmount: parsed.data.totalAmount },
  });
  await saveStore();
}

const updateStructureSchema = structureSchema.extend({ id: z.string().min(1) });

export async function updateStructure(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.FEE_STRUCTURE_WRITE)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };

  const parsed = updateStructureSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };
  const fs = store.feeStructures.get(parsed.data.id);
  if (!fs || fs.instituteId !== user.instituteId) return { error: "Fee structure not found" };

  const cls = store.classes.get(parsed.data.classId);
  const ay = store.academicYears.get(parsed.data.academicYearId);
  if (!cls || cls.instituteId !== user.instituteId) return { error: "Invalid class" };
  if (!ay || ay.instituteId !== user.instituteId) return { error: "Invalid year" };

  fs.name = parsed.data.name;
  fs.totalAmount = parsed.data.totalAmount;
  fs.classId = parsed.data.classId;
  fs.academicYearId = parsed.data.academicYearId;
  fs.items = parseItems(parsed.data.items, parsed.data.totalAmount);

  // Keep assignments in sync: payable = structure total − student discount.
  for (const a of store.feeAssignments.values()) {
    if (a.feeStructureId !== fs.id) continue;
    a.academicYearId = fs.academicYearId;
    a.totalPayable = Math.max(0, fs.totalAmount - a.discount);
    a.status = assignmentStatusFor(a);
    a.updatedAt = new Date().toISOString();
  }

  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "fee_structure.update", entity: "FeeStructure", entityId: fs.id,
    meta: { name: fs.name, totalAmount: fs.totalAmount },
  });
  await saveStore();
}

const assignSchema = z.object({
  feeStructureId: z.string().min(1),
  discount: z.coerce.number().int().min(0).max(10_000_000).optional().default(0),
  discountReason: z.string().max(160).optional().or(z.literal("")),
  studentId: z.string().optional().or(z.literal("")),
  carryForward: z.string().optional().or(z.literal("")),
});

export async function assignFees(fd: FormData): Promise<{ error?: string; created?: number; carried?: number }> {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.FEE_STRUCTURE_WRITE)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };

  const parsed = assignSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };
  const { feeStructureId, discount, discountReason, studentId } = parsed.data;
  const carryForward = parsed.data.carryForward !== "off" && parsed.data.carryForward !== "";

  const fs = store.feeStructures.get(feeStructureId);
  if (!fs || fs.instituteId !== user.instituteId) return { error: "Fee structure not found" };

  const existing = new Set(
    Array.from(store.feeAssignments.values())
      .filter((a) => a.instituteId === user.instituteId && a.feeStructureId === fs.id)
      .map((a) => a.studentId),
  );

  const totalPayable = Math.max(0, fs.totalAmount - discount);
  const now = new Date().toISOString();
  let created = 0;
  let carried = 0;

  const makeAssignment = (sid: string) => {
    const aid = uid("fa");
    let previousBalance = 0;
    const carriedFrom: string[] = [];
    if (carryForward) {
      for (const prior of openPriorAssignments(sid, fs.academicYearId)) {
        previousBalance += assignmentBalance(prior);
        prior.carriedForwardTo = aid;
        prior.updatedAt = now;
        carriedFrom.push(prior.id);
      }
    }
    if (previousBalance > 0) carried += previousBalance;
    store.feeAssignments.set(aid, {
      id: aid, instituteId: user.instituteId!, studentId: sid, feeStructureId: fs.id,
      academicYearId: fs.academicYearId,
      discount,
      discountBy: discount > 0 ? user.id : undefined,
      discountByName: discount > 0 ? user.name : undefined,
      discountReason: discount > 0 ? (discountReason || undefined) : undefined,
      previousBalance, carriedFrom: carriedFrom.length ? carriedFrom : undefined,
      totalPayable, totalPaid: 0, status: "PENDING", createdAt: now, updatedAt: now,
    });
    created++;
  };

  // Single-student mode: assign regardless of class/year match (manual override).
  if (studentId) {
    const s = store.students.get(studentId);
    if (!s || s.instituteId !== user.instituteId) return { error: "Student not found" };
    if (existing.has(s.id)) return { error: "This student already has this fee structure assigned" };
    makeAssignment(s.id);
  } else {
    for (const s of store.students.values()) {
      if (s.instituteId !== user.instituteId) continue;
      if (s.status !== "ACTIVE") continue;
      if (s.classId !== fs.classId) continue;
      if (existing.has(s.id)) continue;
      makeAssignment(s.id);
    }
  }

  if (created === 0) {
    const inClass = Array.from(store.students.values()).filter(
      (s) => s.instituteId === user.instituteId && s.classId === fs.classId && s.status === "ACTIVE",
    );
    if (inClass.length === 0) {
      return { error: "No active students in this structure's class. Add students to that class, or use “One student” mode below." };
    }
    return { error: "All eligible students already have this fee structure assigned." };
  }

  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "fee_assignment.bulk_create", entity: "FeeStructure", entityId: fs.id,
    meta: { created, discount, carried, studentId: studentId || null },
  });
  await saveStore();
  return { created, carried };
}

const updateAssignmentSchema = z.object({
  assignmentId: z.string().min(1),
  /** Optional — set to move the student onto a different fee structure. */
  feeStructureId: z.string().optional().or(z.literal("")),
  discount: z.coerce.number().int().min(0).max(10_000_000),
  discountReason: z.string().max(160).optional().or(z.literal("")),
  previousBalance: z.coerce.number().int().min(0).max(100_000_000).optional(),
});

export async function updateAssignment(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.FEE_STRUCTURE_WRITE)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };

  const parsed = updateAssignmentSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };
  const { assignmentId, discount, discountReason, previousBalance } = parsed.data;

  const assn = store.feeAssignments.get(assignmentId);
  if (!assn || assn.instituteId !== user.instituteId) return { error: "Assignment not found" };

  // Moving a student onto a different structure re-prices the assignment.
  const targetStructureId = parsed.data.feeStructureId || assn.feeStructureId;
  const fs = store.feeStructures.get(targetStructureId);
  if (!fs || fs.instituteId !== user.instituteId) return { error: "Fee structure not found" };
  const structureChanged = targetStructureId !== assn.feeStructureId;
  if (structureChanged) {
    const duplicate = Array.from(store.feeAssignments.values()).some(
      (a) => a.id !== assn.id && a.studentId === assn.studentId && a.feeStructureId === fs.id,
    );
    if (duplicate) return { error: "This student already has that fee structure assigned" };
  }
  if (discount > fs.totalAmount) return { error: "Discount cannot exceed the fee structure total" };

  const newPayable = Math.max(0, fs.totalAmount - discount);
  const newPrev = previousBalance ?? assn.previousBalance ?? 0;
  if (assn.totalPaid > newPayable + newPrev) {
    return { error: "Already-collected amount exceeds the new payable — reduce the discount." };
  }

  const discountChanged = discount !== assn.discount;
  assn.feeStructureId = fs.id;
  assn.discount = discount;
  assn.totalPayable = newPayable;
  assn.previousBalance = newPrev;
  assn.academicYearId = fs.academicYearId;
  if (discountChanged) {
    assn.discountBy = discount > 0 ? user.id : undefined;
    assn.discountByName = discount > 0 ? user.name : undefined;
    assn.discountReason = discount > 0 ? (discountReason || undefined) : undefined;
  } else if (discount > 0) {
    assn.discountReason = discountReason || assn.discountReason;
  }
  assn.status = assignmentStatusFor(assn);
  assn.updatedAt = new Date().toISOString();

  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "fee_assignment.update", entity: "FeeAssignment", entityId: assn.id,
    meta: { discount, previousBalance: newPrev, year: assignmentYearId(assn), feeStructureId: fs.id, structureChanged },
  });
  await saveStore();
}
