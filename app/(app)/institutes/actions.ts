"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/rbac";
import { pushAudit, store } from "@/lib/db/store";
import { uid } from "@/lib/utils";
import { saveStore } from "@/lib/db/persistence";

const schema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(20).regex(/^[A-Z0-9-_]+$/i, "Alphanumeric only"),
  email: z.string().email().max(200).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  address: z.string().max(300).optional().or(z.literal("")),
});

export async function createInstitute(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  if (user.role !== ROLES.SUPER_ADMIN) return { error: "Not authorized" };

  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid data" };

  const { name, code, email, phone, address } = parsed.data;
  for (const inst of store.institutes.values()) {
    if (inst.code.toLowerCase() === code.toLowerCase()) return { error: "Code already in use" };
  }

  const now = new Date().toISOString();
  const id = uid("inst");
  store.institutes.set(id, {
    id, name, code: code.toUpperCase(),
    email: email || undefined, phone: phone || undefined, address: address || undefined,
    status: "ACTIVE", createdAt: now, updatedAt: now,
  });

  pushAudit({
    instituteId: null,
    actorId: user.id,
    actorEmail: user.email,
    action: "institute.create",
    entity: "Institute",
    entityId: id,
    meta: { code, name },
  });
  await saveStore();
}

// Code is a stable identifier set once at creation — never accepted on update,
// even if a caller sends one (defense in depth beyond the disabled UI field).
const updateSchema = schema.omit({ code: true }).extend({
  id: z.string().min(1),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export async function updateInstitute(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  if (user.role !== ROLES.SUPER_ADMIN) return { error: "Not authorized" };

  const parsed = updateSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid data" };
  const { id, name, email, phone, address, status } = parsed.data;

  const inst = store.institutes.get(id);
  if (!inst) return { error: "Institute not found" };

  inst.name = name;
  inst.email = email || undefined;
  inst.phone = phone || undefined;
  inst.address = address || undefined;
  inst.status = status;
  inst.updatedAt = new Date().toISOString();

  pushAudit({
    instituteId: null, actorId: user.id, actorEmail: user.email,
    action: "institute.update", entity: "Institute", entityId: id,
    meta: { name, code: inst.code, status },
  });
  await saveStore();
}

/**
 * Deleting a tenant removes every record scoped to it, so it is only allowed
 * while the institute has no permanent financial history (receipts, expenses,
 * ledger transactions). Once money has moved, Suspend is the correct action.
 */
function instituteBlockedBy(id: string): string | null {
  const count = <T extends { instituteId: string }>(rows: Iterable<T>) =>
    Array.from(rows).filter((r) => r.instituteId === id).length;

  const receipts = count(store.feePayments.values());
  if (receipts > 0) {
    return `Cannot delete — ${receipts} fee receipt${receipts === 1 ? " has" : "s have"} been issued for this institute. Receipts are permanent records; set the institute to Suspended instead.`;
  }
  const expenses = count(store.expenses.values());
  if (expenses > 0) {
    return `Cannot delete — ${expenses} expense voucher${expenses === 1 ? " is" : "s are"} recorded for this institute. Vouchers are permanent records; set the institute to Suspended instead.`;
  }
  const transactions = count(store.transactions.values());
  if (transactions > 0) {
    return `Cannot delete — ${transactions} ledger transaction${transactions === 1 ? " is" : "s are"} recorded for this institute. Set the institute to Suspended instead.`;
  }
  return null;
}

const deleteSchema = z.object({
  id: z.string().min(1),
  /** Typed by the super admin to confirm the tenant-wide delete. */
  code: z.string().min(1),
});

export async function deleteInstitute(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  if (user.role !== ROLES.SUPER_ADMIN) return { error: "Not authorized" };

  const parsed = deleteSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Invalid delete request" };
  const { id, code } = parsed.data;

  const inst = store.institutes.get(id);
  if (!inst) return { error: "Institute not found" };
  if (code.trim().toUpperCase() !== inst.code.toUpperCase()) {
    return { error: `Type ${inst.code} exactly to confirm.` };
  }

  const blocked = instituteBlockedBy(id);
  if (blocked) return { error: blocked };

  // Cascade: every record in the store is scoped by instituteId, and the
  // guard above proved nothing financial is left to preserve.
  type ScopedMap = Iterable<[string, { instituteId: string }]> & { delete(key: string): boolean };
  const scoped: ScopedMap[] = [
    store.academicYears, store.classes, store.batches, store.students,
    store.feeStructures, store.feeAssignments, store.feePayments,
    store.expenseCategories, store.expenses, store.accounts, store.transactions,
  ];
  for (const map of scoped) {
    for (const [key, row] of Array.from(map)) {
      if (row.instituteId === id) map.delete(key);
    }
  }
  for (const [key, u] of Array.from(store.users.entries())) {
    if (u.instituteId === id) {
      store.users.delete(key);
      for (const [token, session] of Array.from(store.refreshTokens.entries())) {
        if (session.userId === key) store.refreshTokens.delete(token);
      }
      for (const [token, reset] of Array.from(store.passwordResets.entries())) {
        if (reset.userId === key) store.passwordResets.delete(token);
      }
    }
  }

  store.institutes.delete(id);

  pushAudit({
    instituteId: null, actorId: user.id, actorEmail: user.email,
    action: "institute.delete", entity: "Institute", entityId: id,
    meta: { name: inst.name, code: inst.code },
  });
  await saveStore();
}
