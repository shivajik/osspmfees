"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { pushAudit, store } from "@/lib/db/store";
import { uid } from "@/lib/utils";

const schema = z.object({ name: z.string().min(1).max(60), code: z.string().max(20).optional().or(z.literal("")) });

export async function createClass(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  if (!hasPermission(permissionsForRole(user.role), PERMISSIONS.CLASS_WRITE)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };
  const id = uid("cls");
  store.classes.set(id, {
    id, instituteId: user.instituteId,
    name: parsed.data.name,
    code: parsed.data.code || undefined,
    createdAt: new Date().toISOString(),
  });
  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "class.create", entity: "Class", entityId: id, meta: { name: parsed.data.name },
  });
}
