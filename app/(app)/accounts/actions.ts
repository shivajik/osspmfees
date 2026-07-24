"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { pushAudit, store } from "@/lib/db/store";
import { uid } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(2).max(120),
  type: z.enum(["BANK", "CASH"]),
  bankName: z.string().max(120).optional().or(z.literal("")),
  accountNo: z.string().max(40).optional().or(z.literal("")),
  ifsc: z.string().max(20).optional().or(z.literal("")),
  openingBal: z.coerce.number().min(0).max(1_000_000_000),
});

export async function createAccount(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.BANK_WRITE)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };

  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };

  const d = parsed.data;
  for (const a of store.accounts.values()) {
    if (a.instituteId === user.instituteId && a.name.toLowerCase() === d.name.toLowerCase()) {
      return { error: "Account name already used" };
    }
  }
  const id = uid("ac");
  store.accounts.set(id, {
    id, instituteId: user.instituteId, name: d.name, type: d.type,
    bankName: d.bankName || undefined, accountNo: d.accountNo || undefined, ifsc: d.ifsc || undefined,
    openingBal: d.openingBal, currentBal: d.openingBal, createdAt: new Date().toISOString(),
  });
  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "account.create", entity: "Account", entityId: id, meta: { name: d.name, type: d.type },
  });
}
