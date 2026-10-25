"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import {
  pushAudit, store, nextReceiptNo,
  assignmentYearId, assignmentBalance, assignmentStatusFor, openPriorAssignments,
  baseFees, extraChargesTotal, conditionalHeadsCharged, assignmentHeadOutstanding, assignmentPayments, isActivePayment,
  type ChequeDetails,
} from "@/lib/db/store";
import { parsePaymentDate, splitSettlement, validateAllocation } from "@/lib/fees/rules";
import { CONDITIONAL_FEE_HEADS, FEE_HEADS } from "@/lib/fee-heads";
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
  /** Date the money was received (YYYY-MM-DD); blank = now. */
  paidOn: z.string().max(10).optional().or(z.literal("")),
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
  const paidOn = parsePaymentDate(parsed.data.paidOn || undefined);
  if (paidOn.error) return { error: paidOn.error };

  // Every payment is allocated to fee heads; each head is capped at what is
  // still owed on it, so a head can never be over-collected.
  let feeHeadBreakup: { head: string; amount: number }[];
  try {
    const raw = JSON.parse(parsed.data.feeHeads || "[]") as { head?: unknown; amount?: unknown }[];
    feeHeadBreakup = (Array.isArray(raw) ? raw : [])
      .map((r) => ({ head: String(r.head ?? "").trim().slice(0, 60), amount: Number(r.amount) }))
      .filter((r) => r.head && r.amount !== 0);
  } catch {
    return { error: "Invalid fee head selection" };
  }
  const settled = amount + discount;
  const allocationError = validateAllocation(feeHeadBreakup, assignmentHeadOutstanding(assn), settled);
  if (allocationError) return { error: allocationError };

  const now = new Date().toISOString();
  const paymentId = uid("pay");
  const receiptNo = nextReceiptNo();

  // Payments (and counter discounts) settle carried-forward previous balance
  // first, then the current year's fees.
  const { toPrevious: appliedToPrevious, toCurrent: appliedToCurrent } =
    splitSettlement(assn.previousBalance ?? 0, assn.totalPaid, settled);

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
    reference: reference || undefined, paidAt: paidOn.iso!, recordedAt: now,
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
      reference: `Fee ${receiptNo}`, paymentId, occurredAt: paidOn.iso!, createdAt: now,
    });
  }

  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "fee.collect", entity: "FeePayment", entityId: paymentId,
    meta: { amount, discount, discountReason: discountReason || null, mode, feeHead: feeHead ?? null, receiptNo, appliedToPrevious, appliedToCurrent, paidAt: paidOn.iso },
  });
  await saveStore();
  return { paymentId };
}

const editPaymentSchema = z.object({
  paymentId: z.string().min(1),
  mode: z.enum(["CASH", "BANK", "CARD", "UPI", "CHEQUE", "ONLINE"]),
  reference: z.string().max(80).optional().or(z.literal("")),
  reason: z.string().max(160).optional().or(z.literal("")),
  ...chequeFields,
});

/**
 * Corrects a receipt's payment details (mode, reference, cheque). The amount
 * and fee-head split are deliberately not editable: a wrong amount is fixed by
 * reversing the receipt and recording a new one, so the original stays on
 * record. Every edit keeps the previous values in `history`.
 */
export async function updatePayment(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.FEE_COLLECT)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };

  const parsed = editPaymentSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };
  const { paymentId, mode, reference, reason } = parsed.data;

  const pay = store.feePayments.get(paymentId);
  if (!pay || pay.instituteId !== user.instituteId) return { error: "Payment not found" };
  if (!isActivePayment(pay)) return { error: "This receipt was reversed and can no longer be edited" };

  const cq = buildCheque(mode, parsed.data);
  if (cq.error) return { error: cq.error };

  const now = new Date().toISOString();
  pay.history = [...(pay.history ?? []), {
    at: now, by: user.id, byName: user.name,
    mode: pay.mode, reference: pay.reference, chequeNo: pay.cheque?.chequeNo,
    reason: reason || undefined,
  }];
  const previous = { mode: pay.mode, reference: pay.reference ?? null };
  pay.mode = mode;
  pay.reference = reference || undefined;
  pay.cheque = cq.cheque;
  pay.updatedAt = now;
  pay.updatedBy = user.id;
  pay.updatedByName = user.name;

  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "fee.payment_update", entity: "FeePayment", entityId: pay.id,
    meta: { receiptNo: pay.receiptNo, previous, mode, reference: reference || null, reason: reason || null },
  });
  await saveStore();
}

const reverseSchema = z.object({
  paymentId: z.string().min(1),
  reason: z.string().trim().min(3, "Enter a reason for reversing this receipt").max(160),
});

/**
 * Reverses a receipt: the record is kept (marked reversed), the student's
 * balance goes back up, and any money is debited from the account it was
 * credited to. Once a year's dues are carried forward that year is frozen.
 */
export async function reversePayment(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.FEE_ADJUST)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };

  const parsed = reverseSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };
  const { paymentId, reason } = parsed.data;

  const pay = store.feePayments.get(paymentId);
  if (!pay || pay.instituteId !== user.instituteId) return { error: "Payment not found" };
  if (!isActivePayment(pay)) return { error: "This receipt is already reversed" };
  const assn = store.feeAssignments.get(pay.assignmentId);
  if (!assn) return { error: "Assignment not found" };
  if (assn.carriedForwardTo) {
    return { error: "This year's balance was already carried forward — the receipt can no longer be reversed." };
  }

  const settled = pay.amount + (pay.discount ?? 0);
  if (assn.totalPaid < settled) return { error: "Ledger is inconsistent for this assignment — contact support" };

  const now = new Date().toISOString();
  if (pay.amount > 0 && pay.accountId) {
    const acc = store.accounts.get(pay.accountId);
    if (acc && acc.instituteId === user.instituteId) {
      acc.currentBal -= pay.amount;
      const txnId = uid("txn");
      store.transactions.set(txnId, {
        id: txnId, instituteId: user.instituteId, accountId: acc.id,
        direction: "DEBIT", amount: pay.amount, balanceAfter: acc.currentBal,
        reference: `Reversal ${pay.receiptNo}`, paymentId: pay.id, occurredAt: now, createdAt: now,
      });
    }
  }

  assn.totalPaid -= settled;
  if (pay.discount) assn.collectionDiscount = Math.max(0, (assn.collectionDiscount ?? 0) - pay.discount);
  assn.status = assignmentStatusFor(assn);
  assn.updatedAt = now;

  pay.voidedAt = now;
  pay.voidedBy = user.id;
  pay.voidedByName = user.name;
  pay.voidReason = reason;

  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "fee.payment_reverse", entity: "FeePayment", entityId: pay.id,
    meta: { receiptNo: pay.receiptNo, amount: pay.amount, discount: pay.discount ?? 0, reason, studentId: pay.studentId },
  });
  await saveStore();
}

// ---------------------------------------------------------------------------
// Conditional charges (e.g. TC fees) added to one student
// ---------------------------------------------------------------------------

const chargeSchema = z.object({
  assignmentId: z.string().min(1),
  head: z.string().trim().min(2).max(60),
  amount: z.coerce.number().int().positive().max(10_000_000),
  reason: z.string().trim().max(160).optional().or(z.literal("")),
});

export async function addFeeCharge(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.FEE_ADJUST)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };

  const parsed = chargeSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };
  const { assignmentId, head, amount, reason } = parsed.data;

  const assn = store.feeAssignments.get(assignmentId);
  if (!assn || assn.instituteId !== user.instituteId) return { error: "Assignment not found" };
  if (assn.carriedForwardTo) return { error: "This year is closed (balance carried forward) — add the charge to the latest year." };
  // A conditional head is charged once per year; a second request is almost
  // always a double click or a mistake, and would inflate the dues.
  if (
    (assn.extraItems ?? []).some((e) => e.head.toLowerCase() === head.toLowerCase()) ||
    conditionalHeadsCharged(assn.studentId, assignmentYearId(assn)).has(head.toLowerCase())
  ) {
    return { error: `${head} is already charged to this student for this year` };
  }
  if (!(FEE_HEADS as readonly string[]).includes(head) && !reason) {
    return { error: "Give a reason for a custom fee head" };
  }

  const now = new Date().toISOString();
  const charge = { id: uid("chg"), head, amount, reason: reason || undefined, addedAt: now, addedBy: user.id, addedByName: user.name };
  assn.extraItems = [...(assn.extraItems ?? []), charge];
  assn.totalPayable += amount;
  assn.status = assignmentStatusFor(assn);
  assn.updatedAt = now;

  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "fee_charge.add", entity: "FeeAssignment", entityId: assn.id,
    meta: { chargeId: charge.id, head, amount, reason: reason || null, studentId: assn.studentId },
  });
  await saveStore();
}

const removeChargeSchema = z.object({ assignmentId: z.string().min(1), chargeId: z.string().min(1) });

/** Removes a charge added by mistake — only while nothing has been collected against that head. */
export async function removeFeeCharge(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.FEE_ADJUST)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };

  const parsed = removeChargeSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Invalid" };
  const assn = store.feeAssignments.get(parsed.data.assignmentId);
  if (!assn || assn.instituteId !== user.instituteId) return { error: "Assignment not found" };
  if (assn.carriedForwardTo) return { error: "This year is closed (balance carried forward)" };
  const charge = (assn.extraItems ?? []).find((e) => e.id === parsed.data.chargeId);
  if (!charge) return { error: "Charge not found" };

  const collected = assignmentPayments(assn.id)
    .flatMap((p) => p.feeHeadBreakup ?? [])
    .filter((h) => h.head === charge.head)
    .reduce((sum, h) => sum + h.amount, 0);
  if (collected > 0) {
    return { error: `₹${collected.toLocaleString("en-IN")} was already collected for ${charge.head} — reverse those receipts first.` };
  }
  const newPayable = Math.max(0, assn.totalPayable - charge.amount);
  if (assn.totalPaid > newPayable + (assn.previousBalance ?? 0)) {
    return { error: "Already-collected amount would exceed the new payable" };
  }

  assn.extraItems = (assn.extraItems ?? []).filter((e) => e.id !== charge.id);
  assn.totalPayable = newPayable;
  assn.status = assignmentStatusFor(assn);
  assn.updatedAt = new Date().toISOString();

  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "fee_charge.remove", entity: "FeeAssignment", entityId: assn.id,
    meta: { chargeId: charge.id, head: charge.head, amount: charge.amount, studentId: assn.studentId },
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
    a.totalPayable = Math.max(0, fs.totalAmount + extraChargesTotal(a) - a.discount);
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

export async function assignFees(fd: FormData): Promise<{ error?: string; created?: number; updated?: number; carried?: number }> {
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

    // Already assigned? Re-price that one student's assignment in place rather
    // than failing — nobody else in the class is touched.
    if (existing.has(s.id)) {
      const assn = Array.from(store.feeAssignments.values()).find(
        (a) => a.instituteId === user.instituteId && a.feeStructureId === fs.id && a.studentId === s.id,
      );
      if (!assn) return { error: "This student already has this fee structure assigned" };
      if (assn.carriedForwardTo) {
        return { error: "This year's balance was already carried forward — edit the later year's assignment instead." };
      }

      // Work out the effect first; only commit once it is known to be valid.
      const priors = carryForward
        ? openPriorAssignments(s.id, fs.academicYearId).filter((p) => p.id !== assn.id)
        : [];
      const carriedNow = priors.reduce((sum, p) => sum + assignmentBalance(p), 0);
      const newPayable = Math.max(0, fs.totalAmount + extraChargesTotal(assn) - discount);
      const newPrev = (assn.previousBalance ?? 0) + carriedNow;
      if (assn.totalPaid > newPayable + newPrev) {
        return { error: "Already-collected amount exceeds the new payable — reduce the discount." };
      }

      for (const prior of priors) {
        prior.carriedForwardTo = assn.id;
        prior.updatedAt = now;
      }
      if (priors.length) {
        assn.carriedFrom = [...(assn.carriedFrom ?? []), ...priors.map((p) => p.id)];
      }
      const discountChanged = discount !== assn.discount;
      assn.discount = discount;
      assn.totalPayable = newPayable;
      assn.previousBalance = newPrev;
      assn.academicYearId = fs.academicYearId;
      if (discountChanged) {
        assn.discountBy = discount > 0 ? user.id : undefined;
        assn.discountByName = discount > 0 ? user.name : undefined;
        assn.discountReason = discount > 0 ? (discountReason || undefined) : undefined;
      } else if (discount > 0 && discountReason) {
        assn.discountReason = discountReason;
      }
      assn.status = assignmentStatusFor(assn);
      assn.updatedAt = now;

      pushAudit({
        instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
        action: "fee_assignment.update", entity: "FeeAssignment", entityId: assn.id,
        meta: { via: "assign_dialog", discount, carried: carriedNow, studentId: s.id },
      });
      await saveStore();
      return { updated: 1, carried: carriedNow };
    }

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
  /** Per-student fee heads, editable while the assignment stays custom. */
  items: z.string().max(2000).optional().or(z.literal("")),
  name: z.string().max(120).optional().or(z.literal("")),
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

  // Moving a student onto a different structure re-prices the assignment; an
  // empty id keeps the per-student custom fees this assignment already carries.
  const targetStructureId = parsed.data.feeStructureId ?? assn.feeStructureId;
  const keepCustom = targetStructureId === "";
  const fs = keepCustom ? null : store.feeStructures.get(targetStructureId);
  if (!keepCustom && (!fs || fs.instituteId !== user.instituteId)) return { error: "Fee structure not found" };
  const structureChanged = !!fs && fs.id !== assn.feeStructureId;
  if (structureChanged && fs) {
    const duplicate = Array.from(store.feeAssignments.values()).some(
      (a) => a.id !== assn.id && a.studentId === assn.studentId && a.feeStructureId === fs.id,
    );
    if (duplicate) return { error: "This student already has that fee structure assigned" };
  }
  // Custom assignments can have their heads retyped in the same edit.
  let newItems: { head: string; amount: number }[] | undefined;
  if (keepCustom && parsed.data.items) {
    newItems = parseItems(parsed.data.items, 0).filter((i) => i.amount > 0);
    if (!newItems.length) return { error: "Add at least one fee head with an amount" };
  }
  const feeTotal = (fs
    ? fs.totalAmount
    : newItems
      ? newItems.reduce((sum, i) => sum + i.amount, 0)
      : baseFees(assn).totalAmount) + extraChargesTotal(assn);
  if (discount > feeTotal) return { error: "Discount cannot exceed the fee total" };

  const newPayable = Math.max(0, feeTotal - discount);
  const newPrev = previousBalance ?? assn.previousBalance ?? 0;
  if (assn.totalPaid > newPayable + newPrev) {
    return { error: "Already-collected amount exceeds the new payable — reduce the discount." };
  }

  const discountChanged = discount !== assn.discount;
  if (fs) {
    // Switching onto a shared structure retires this assignment's own heads.
    assn.feeStructureId = fs.id;
    assn.customName = undefined;
    assn.customItems = undefined;
  } else {
    if (newItems) assn.customItems = newItems;
    if (parsed.data.name?.trim()) assn.customName = parsed.data.name.trim();
  }
  assn.discount = discount;
  assn.totalPayable = newPayable;
  assn.previousBalance = newPrev;
  if (fs) assn.academicYearId = fs.academicYearId;
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
    meta: { discount, previousBalance: newPrev, year: assignmentYearId(assn), feeStructureId: assn.feeStructureId || "custom", structureChanged },
  });
  await saveStore();
}


// ---------------------------------------------------------------------------
// Per-student fees set up at the counter
// ---------------------------------------------------------------------------

const setupSchema = z.object({
  studentId: z.string().min(1),
  /** STRUCTURE reuses a shared structure; CUSTOM captures heads for this student only. */
  mode: z.enum(["STRUCTURE", "CUSTOM"]),
  feeStructureId: z.string().optional().or(z.literal("")),
  name: z.string().max(120).optional().or(z.literal("")),
  academicYearId: z.string().optional().or(z.literal("")),
  items: z.string().max(2000).optional().or(z.literal("")),
  discount: z.coerce.number().int().min(0).max(10_000_000).optional().default(0),
  discountReason: z.string().max(160).optional().or(z.literal("")),
  carryForward: z.string().optional().or(z.literal("")),
});

/**
 * Gives one student something to pay against — either a shared fee structure or
 * heads typed on the spot. Returns the assignment so the caller can go straight
 * to the collection screen.
 */
export async function setupStudentFees(fd: FormData): Promise<{ error?: string; assignmentId?: string }> {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.FEE_STRUCTURE_WRITE)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };

  const parsed = setupSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };
  const { studentId, mode, discount, discountReason } = parsed.data;
  const carryForward = parsed.data.carryForward !== "off" && parsed.data.carryForward !== "";

  const student = store.students.get(studentId);
  if (!student || student.instituteId !== user.instituteId) return { error: "Student not found" };

  let feeStructureId = "";
  let customName: string | undefined;
  let customItems: { head: string; amount: number }[] | undefined;
  let total = 0;
  let academicYearId = "";

  if (mode === "STRUCTURE") {
    const fs = store.feeStructures.get(parsed.data.feeStructureId ?? "");
    if (!fs || fs.instituteId !== user.instituteId) return { error: "Pick a fee structure" };
    const duplicate = Array.from(store.feeAssignments.values()).some(
      (a) => a.studentId === student.id && a.feeStructureId === fs.id,
    );
    if (duplicate) return { error: "This student already has that fee structure — collect against it instead." };
    feeStructureId = fs.id;
    total = fs.totalAmount;
    academicYearId = fs.academicYearId;
  } else {
    const ay = store.academicYears.get(parsed.data.academicYearId ?? "");
    if (!ay || ay.instituteId !== user.instituteId) return { error: "Pick an academic year" };
    customItems = parseItems(parsed.data.items, 0).filter((i) => i.amount > 0);
    if (!customItems.length) return { error: "Add at least one fee head with an amount" };
    const already = conditionalHeadsCharged(student.id, ay.id);
    const seen = new Set<string>();
    for (const i of customItems) {
      const h = i.head.toLowerCase();
      if (!CONDITIONAL_FEE_HEADS.some((c) => c.toLowerCase() === h)) continue;
      if (already.has(h) || seen.has(h)) return { error: `${i.head} is already charged to this student for ${ay.name}` };
      seen.add(h);
    }
    customName = parsed.data.name?.trim() || `Fees ${ay.name}`;
    total = customItems.reduce((sum, i) => sum + i.amount, 0);
    academicYearId = ay.id;
  }

  if (discount > total) return { error: "Discount cannot exceed the fee total" };

  const now = new Date().toISOString();
  const aid = uid("fa");

  // Same carry-forward rule as a bulk assign: older unpaid years roll in here.
  let previousBalance = 0;
  const carriedFrom: string[] = [];
  if (carryForward) {
    for (const prior of openPriorAssignments(student.id, academicYearId)) {
      previousBalance += assignmentBalance(prior);
      prior.carriedForwardTo = aid;
      prior.updatedAt = now;
      carriedFrom.push(prior.id);
    }
  }

  store.feeAssignments.set(aid, {
    id: aid, instituteId: user.instituteId, studentId: student.id,
    feeStructureId, customName, customItems,
    academicYearId,
    discount,
    discountBy: discount > 0 ? user.id : undefined,
    discountByName: discount > 0 ? user.name : undefined,
    discountReason: discount > 0 ? (discountReason || undefined) : undefined,
    previousBalance, carriedFrom: carriedFrom.length ? carriedFrom : undefined,
    totalPayable: Math.max(0, total - discount),
    totalPaid: 0, status: "PENDING", createdAt: now, updatedAt: now,
  });

  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "fee_assignment.create", entity: "FeeAssignment", entityId: aid,
    meta: { via: "counter_setup", mode, studentId: student.id, total, discount, carried: previousBalance },
  });
  await saveStore();
  return { assignmentId: aid };
}
