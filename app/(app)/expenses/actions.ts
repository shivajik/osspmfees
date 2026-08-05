"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { pushAudit, store, nextVoucherNo, type ChequeDetails } from "@/lib/db/store";
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
    return { error: "Cheque number, cheque date and bank name are required for cheque expenses" };
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

const expSchema = z.object({
  description: z.string().min(2).max(200),
  amount: z.coerce.number().int().positive().max(100_000_000),
  spentAt: z.string().min(8),
  categoryId: z.string().min(1),
  mode: z.enum(["CASH", "BANK", "CARD", "UPI", "CHEQUE", "ONLINE"]),
  accountId: z.string().min(1),
  ...chequeFields,
});

export async function createExpense(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.EXPENSE_WRITE)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };

  const parsed = expSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };

  const { description, amount, spentAt, categoryId, mode, accountId } = parsed.data;
  const cat = store.expenseCategories.get(categoryId);
  const acc = store.accounts.get(accountId);
  if (!cat || cat.instituteId !== user.instituteId) return { error: "Invalid category" };
  if (!acc || acc.instituteId !== user.instituteId) return { error: "Invalid account" };
  if (acc.currentBal < amount) return { error: "Insufficient account balance" };

  const cq = buildCheque(mode, parsed.data);
  if (cq.error) return { error: cq.error };

  const id = uid("exp");
  const voucherNo = nextVoucherNo();
  const now = new Date().toISOString();
  const spentIso = new Date(spentAt).toISOString();

  store.expenses.set(id, {
    id, instituteId: user.instituteId, categoryId,
    voucherNo, description, amount, spentAt: spentIso, mode,
    accountId, cheque: cq.cheque,
    status: "PAID", createdAt: now, createdBy: user.id,
  });

  acc.currentBal -= amount;
  const txnId = uid("txn");
  store.transactions.set(txnId, {
    id: txnId, instituteId: user.instituteId, accountId,
    direction: "DEBIT", amount, balanceAfter: acc.currentBal,
    reference: `Expense ${voucherNo}`, expenseId: id, occurredAt: spentIso, createdAt: now,
  });

  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "expense.create", entity: "Expense", entityId: id,
    meta: { amount, voucherNo, category: cat.name, cheque: cq.cheque?.chequeNo ?? null },
  });
  await saveStore();
}

const updateExpSchema = expSchema.extend({ id: z.string().min(1) });

export async function updateExpense(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.EXPENSE_WRITE)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };

  const parsed = updateExpSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };
  const { id, description, amount, spentAt, categoryId, mode, accountId } = parsed.data;

  const exp = store.expenses.get(id);
  if (!exp || exp.instituteId !== user.instituteId) return { error: "Expense not found" };
  const cat = store.expenseCategories.get(categoryId);
  const acc = store.accounts.get(accountId);
  if (!cat || cat.instituteId !== user.instituteId) return { error: "Invalid category" };
  if (!acc || acc.instituteId !== user.instituteId) return { error: "Invalid account" };

  const cq = buildCheque(mode, parsed.data);
  if (cq.error) return { error: cq.error };

  const now = new Date().toISOString();
  const spentIso = new Date(spentAt).toISOString();
  const oldAcc = exp.accountId ? store.accounts.get(exp.accountId) : undefined;

  // Reverse the old debit, then apply the new one (may be a different account).
  if (oldAcc) oldAcc.currentBal += exp.amount;
  if (acc.currentBal < amount) {
    if (oldAcc) oldAcc.currentBal -= exp.amount; // roll back
    return { error: "Insufficient account balance for the new amount" };
  }
  acc.currentBal -= amount;

  const txnId = uid("txn");
  store.transactions.set(txnId, {
    id: txnId, instituteId: user.instituteId, accountId: acc.id,
    direction: "DEBIT", amount: 0, balanceAfter: acc.currentBal,
    reference: `Expense ${exp.voucherNo} edited (${exp.amount} → ${amount})`,
    expenseId: exp.id, occurredAt: spentIso, createdAt: now,
  });

  exp.description = description;
  exp.amount = amount;
  exp.spentAt = spentIso;
  exp.categoryId = categoryId;
  exp.mode = mode;
  exp.accountId = accountId;
  exp.cheque = cq.cheque;
  exp.updatedAt = now;
  exp.updatedBy = user.id;
  exp.updatedByName = user.name;

  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "expense.update", entity: "Expense", entityId: exp.id,
    meta: { amount, voucherNo: exp.voucherNo, category: cat.name },
  });
  await saveStore();
}

const catSchema = z.object({ name: z.string().min(2).max(80) });

export async function createCategory(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.EXPENSE_WRITE)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };
  const parsed = catSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };
  for (const c of store.expenseCategories.values()) {
    if (c.instituteId === user.instituteId && c.name.toLowerCase() === parsed.data.name.toLowerCase()) {
      return { error: "Category exists" };
    }
  }
  const id = uid("ec");
  store.expenseCategories.set(id, { id, instituteId: user.instituteId, name: parsed.data.name, createdAt: new Date().toISOString() });
  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "expense_category.create", entity: "ExpenseCategory", entityId: id, meta: { name: parsed.data.name },
  });
  await saveStore();
}

const updateCatSchema = catSchema.extend({ id: z.string().min(1) });

export async function updateCategory(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.EXPENSE_WRITE)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };
  const parsed = updateCatSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };

  const cat = store.expenseCategories.get(parsed.data.id);
  if (!cat || cat.instituteId !== user.instituteId) return { error: "Category not found" };
  for (const c of store.expenseCategories.values()) {
    if (c.id !== cat.id && c.instituteId === user.instituteId && c.name.toLowerCase() === parsed.data.name.toLowerCase()) {
      return { error: "Another category already uses this name" };
    }
  }
  const before = cat.name;
  cat.name = parsed.data.name;
  cat.updatedAt = new Date().toISOString();

  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "expense_category.update", entity: "ExpenseCategory", entityId: cat.id,
    meta: { before, after: cat.name },
  });
  await saveStore();
}

export async function deleteCategory(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.EXPENSE_WRITE)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };
  const id = String(fd.get("id") ?? "");
  const cat = store.expenseCategories.get(id);
  if (!cat || cat.instituteId !== user.instituteId) return { error: "Category not found" };

  const used = Array.from(store.expenses.values()).some((e) => e.categoryId === id);
  if (used) return { error: "This category is used by existing expenses — rename it instead." };

  store.expenseCategories.delete(id);
  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "expense_category.delete", entity: "ExpenseCategory", entityId: id, meta: { name: cat.name },
  });
  await saveStore();
}
