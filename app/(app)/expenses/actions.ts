"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { pushAudit, store, nextVoucherNo } from "@/lib/db/store";
import { uid } from "@/lib/utils";
import { saveStore } from "@/lib/db/persistence";

const expSchema = z.object({
  description: z.string().min(2).max(200),
  amount: z.coerce.number().int().positive().max(100_000_000),
  spentAt: z.string().min(8),
  categoryId: z.string().min(1),
  mode: z.enum(["CASH", "BANK", "CARD", "UPI", "CHEQUE", "ONLINE"]),
  accountId: z.string().min(1),
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

  const id = uid("exp");
  const voucherNo = nextVoucherNo();
  const now = new Date().toISOString();
  const spentIso = new Date(spentAt).toISOString();

  store.expenses.set(id, {
    id, instituteId: user.instituteId, categoryId,
    voucherNo, description, amount, spentAt: spentIso, mode,
    accountId, status: "PAID", createdAt: now, createdBy: user.id,
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
    meta: { amount, voucherNo, category: cat.name },
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
