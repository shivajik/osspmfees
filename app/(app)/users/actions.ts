"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, ROLES, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { pushAudit, store, findUserByEmail } from "@/lib/db/store";
import { hashPassword } from "@/lib/auth/password";
import { uid } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(200),
  role: z.enum([ROLES.SUPER_ADMIN, ROLES.INSTITUTE_ADMIN, ROLES.ACCOUNTANT, ROLES.CASHIER, ROLES.VIEWER]),
  instituteId: z.string().optional().or(z.literal("")),
  password: z.string().min(10).max(200).regex(/[A-Z]/, "Uppercase required").regex(/[a-z]/, "Lowercase required").regex(/\d/, "Digit required"),
});

export async function createUser(fd: FormData): Promise<{ error?: string } | void> {
  const actor = await requireUser();
  if (!hasPermission(permissionsForRole(actor.role), PERMISSIONS.USER_MANAGE)) {
    return { error: "Not authorized" };
  }

  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid data" };

  const { name, email, role, password } = parsed.data;
  let { instituteId } = parsed.data;

  const isSuper = actor.role === ROLES.SUPER_ADMIN;
  if (!isSuper) {
    if (role === ROLES.SUPER_ADMIN) return { error: "Cannot assign Super Admin" };
    instituteId = actor.instituteId ?? "";
  }
  if (role !== ROLES.SUPER_ADMIN && !instituteId) return { error: "Institute is required" };

  if (findUserByEmail(email)) return { error: "Email already exists" };

  const now = new Date().toISOString();
  const id = uid("usr");
  store.users.set(id, {
    id,
    name,
    email,
    passwordHash: await hashPassword(password),
    role,
    instituteId: role === ROLES.SUPER_ADMIN ? null : instituteId!,
    active: true,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now,
  });

  pushAudit({
    instituteId: actor.instituteId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: "user.create",
    entity: "User",
    entityId: id,
    meta: { role, email },
  });
}
