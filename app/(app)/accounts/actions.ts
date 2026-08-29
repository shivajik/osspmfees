"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, ROLES, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { pushAudit, store } from "@/lib/db/store";
import { uid } from "@/lib/utils";
import { saveStore } from "@/lib/db/persistence";

const schema = z.object({
  name: z.string().min(2).max(120),
  type: z.enum(["BANK", "CASH"]),
  bankName: z.string().max(120).optional().or(z.literal("")),
  accountNo: z.string().max(40).optional().or(z.literal("")),
  ifsc: z.string().max(20).optional().or(z.literal("")),
  openingBal: z.coerce.number().min(0).max(1_000_000_000),
  instituteId: z.string().optional().or(z.literal("")),
});

export async function createAccount(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.BANK_WRITE)) return { error: "Not authorized" };

  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };

  const isSuper = user.role === ROLES.SUPER_ADMIN;
  const instituteId = isSuper ? parsed.data.instituteId || "" : user.instituteId ?? "";
  if (!instituteId) return { error: "Institute is required" };
  if (isSuper && !store.institutes.has(instituteId)) return { error: "Invalid institute" };

  const d = parsed.data;
  for (const a of store.accounts.values()) {
    if (a.instituteId === instituteId && a.name.toLowerCase() === d.name.toLowerCase()) {
      return { error: "Account name already used" };
    }
  }
  const id = uid("ac");
  store.accounts.set(id, {
    id, instituteId, name: d.name, type: d.type,
    bankName: d.bankName || undefined, accountNo: d.accountNo || undefined, ifsc: d.ifsc || undefined,
    openingBal: d.openingBal, currentBal: d.openingBal, createdAt: new Date().toISOString(),
  });
  pushAudit({
    instituteId, actorId: user.id, actorEmail: user.email,
    action: "account.create", entity: "Account", entityId: id, meta: { name: d.name, type: d.type },
  });
  await saveStore();
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(120),
  type: z.enum(["BANK", "CASH"]),
  bankName: z.string().max(120).optional().or(z.literal("")),
  accountNo: z.string().max(40).optional().or(z.literal("")),
  ifsc: z.string().max(20).optional().or(z.literal("")),
});

/** Fixes basic account details (e.g. a mistyped account number) — never touches openingBal/currentBal, which would corrupt the running ledger balance. */
export async function updateAccount(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.BANK_WRITE)) return { error: "Not authorized" };

  const parsed = updateSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };

  const acc = store.accounts.get(parsed.data.id);
  if (!acc) return { error: "Account not found" };
  const isSuper = user.role === ROLES.SUPER_ADMIN;
  if (!isSuper && acc.instituteId !== user.instituteId) return { error: "Not authorized" };

  const d = parsed.data;
  for (const a of store.accounts.values()) {
    if (a.id !== acc.id && a.instituteId === acc.instituteId && a.name.toLowerCase() === d.name.toLowerCase()) {
      return { error: "Account name already used" };
    }
  }

  const before = { name: acc.name, type: acc.type, bankName: acc.bankName, accountNo: acc.accountNo, ifsc: acc.ifsc };
  acc.name = d.name;
  acc.type = d.type;
  acc.bankName = d.bankName || undefined;
  acc.accountNo = d.accountNo || undefined;
  acc.ifsc = d.ifsc || undefined;

  pushAudit({
    instituteId: acc.instituteId, actorId: user.id, actorEmail: user.email,
    action: "account.update", entity: "Account", entityId: acc.id, meta: { before, after: d },
  });
  await saveStore();
}
