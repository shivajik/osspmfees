"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, ROLES, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { pushAudit, store, findUserByEmail } from "@/lib/db/store";
import { hashPassword } from "@/lib/auth/password";
import { uid } from "@/lib/utils";
import { saveStore } from "@/lib/db/persistence";

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
    instituteId: role === ROLES.SUPER_ADMIN ? null : instituteId ?? null,
    active: true,
    failedLoginCount: 0,
    lockedUntil: null,
    mustChangePassword: true,
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
  await saveStore();
}

const updateSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(2).max(120),
  email: z.string().email().max(200),
  role: z.enum([ROLES.SUPER_ADMIN, ROLES.INSTITUTE_ADMIN, ROLES.ACCOUNTANT, ROLES.CASHIER, ROLES.VIEWER]),
  instituteId: z.string().optional().or(z.literal("")),
});

/** Edits an existing user's name/email/role/institute — fixes a super admin's mis-assignment without recreating the account. */
export async function updateUser(fd: FormData): Promise<{ error?: string } | void> {
  const actor = await requireUser();
  if (!hasPermission(permissionsForRole(actor.role), PERMISSIONS.USER_MANAGE)) {
    return { error: "Not authorized" };
  }

  const parsed = updateSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid data" };

  const { userId, name, email, role } = parsed.data;
  let { instituteId } = parsed.data;

  const target = store.users.get(userId);
  if (!target) return { error: "User not found" };
  if (target.id === actor.id) return { error: "You cannot edit your own account here" };

  const isSuper = actor.role === ROLES.SUPER_ADMIN;
  if (!isSuper) {
    if (target.instituteId !== actor.instituteId) return { error: "Not authorized" };
    if (role === ROLES.SUPER_ADMIN || target.role === ROLES.SUPER_ADMIN) return { error: "Not authorized" };
    instituteId = actor.instituteId ?? "";
  }
  if (role !== ROLES.SUPER_ADMIN && !instituteId) return { error: "Institute is required" };

  const existing = findUserByEmail(email);
  if (existing && existing.id !== userId) return { error: "Email already exists" };

  const nextInstituteId = role === ROLES.SUPER_ADMIN ? null : instituteId ?? null;
  const before = { name: target.name, email: target.email, role: target.role, instituteId: target.instituteId };

  target.name = name;
  target.email = email;
  target.role = role;
  target.instituteId = nextInstituteId;
  target.updatedAt = new Date().toISOString();

  pushAudit({
    instituteId: actor.instituteId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: "user.update",
    entity: "User",
    entityId: target.id,
    meta: { before, after: { name, email, role, instituteId: nextInstituteId } },
  });
  await saveStore();
}

const statusSchema = z.object({
  userId: z.string().min(1),
  op: z.enum(["LOCK", "UNLOCK", "DISABLE", "ENABLE"]),
  /** Lock duration in hours; 0 = indefinite. */
  hours: z.coerce.number().min(0).max(8760).optional().default(0),
  reason: z.string().max(200).optional().or(z.literal("")),
});

const INDEFINITE_LOCK_MS = 100 * 365 * 24 * 60 * 60 * 1000;

export async function setUserAccess(fd: FormData): Promise<{ error?: string } | void> {
  const actor = await requireUser();
  if (!hasPermission(permissionsForRole(actor.role), PERMISSIONS.USER_MANAGE)) {
    return { error: "Not authorized" };
  }

  const parsed = statusSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid data" };
  const { userId, op, hours, reason } = parsed.data;

  const target = store.users.get(userId);
  if (!target) return { error: "User not found" };
  if (target.id === actor.id) return { error: "You cannot change your own access" };

  const isSuper = actor.role === ROLES.SUPER_ADMIN;
  if (!isSuper) {
    if (!actor.instituteId || target.instituteId !== actor.instituteId) return { error: "Not authorized" };
    if (target.role === ROLES.SUPER_ADMIN) return { error: "Not authorized" };
  }

  if (op === "LOCK") {
    target.lockedUntil = Date.now() + (hours > 0 ? hours * 60 * 60 * 1000 : INDEFINITE_LOCK_MS);
  } else if (op === "UNLOCK") {
    target.lockedUntil = null;
    target.failedLoginCount = 0;
  } else if (op === "DISABLE") {
    target.active = false;
  } else {
    target.active = true;
    target.failedLoginCount = 0;
  }
  target.updatedAt = new Date().toISOString();

  // Revoke live sessions so the change takes effect immediately.
  if (op === "LOCK" || op === "DISABLE") {
    for (const [jti, rt] of store.refreshTokens) {
      if (rt.userId === target.id) store.refreshTokens.delete(jti);
    }
  }

  pushAudit({
    instituteId: actor.instituteId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: `user.${op.toLowerCase()}`,
    entity: "User",
    entityId: target.id,
    meta: { email: target.email, hours: op === "LOCK" ? hours : undefined, reason: reason || undefined },
  });
  await saveStore();
}
