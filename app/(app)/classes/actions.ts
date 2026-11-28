"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { pushAudit, store } from "@/lib/db/store";
import { uid } from "@/lib/utils";
import { saveStore } from "@/lib/db/persistence";
import { STREAMS, STREAM_SUFFIX, normalizeClassName } from "@/lib/academics";


const schema = z.object({
  name: z.string().min(1).max(60),
  code: z.string().max(20).optional().or(z.literal("")),
  /** Arts / Science / Commerce… for classes 11 and 12; blank = no stream. */
  stream: z.enum(STREAMS).optional().or(z.literal("")),
});

/** "11" + "Arts" → "Class 11 Arts"; a stream already typed in the name is kept. */
function className(name: string, stream?: string): string {
  const base = normalizeClassName(name);
  return normalizeClassName(stream && !base.toLowerCase().endsWith(stream.toLowerCase()) ? `${base} ${stream}` : base);
}

export async function createClass(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  if (!hasPermission(permissionsForRole(user.role), PERMISSIONS.CLASS_WRITE)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };
  const name = className(parsed.data.name, parsed.data.stream);
  for (const c of store.classes.values()) {
    if (c.instituteId === user.instituteId && normalizeClassName(c.name) === name) {
      return { error: `"${name}" already exists for this institute.` };
    }
  }
  const id = uid("cls");

  store.classes.set(id, {
    id, instituteId: user.instituteId,
    name,
    code: parsed.data.code || undefined,
    createdAt: new Date().toISOString(),
  });
  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "class.create", entity: "Class", entityId: id, meta: { name: parsed.data.name },
  });
  await saveStore();
}

const updateSchema = schema.extend({ id: z.string().min(1) });

/**
 * Renames a class or sets its stream. Every student, fee structure and report
 * points at the class id, so they all show the new name straight away.
 */
export async function updateClass(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  if (!hasPermission(permissionsForRole(user.role), PERMISSIONS.CLASS_WRITE)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };
  const parsed = updateSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };
  const cls = store.classes.get(parsed.data.id);
  if (!cls || cls.instituteId !== user.instituteId) return { error: "Class not found" };

  // Changing the stream replaces any stream already in the name.
  const base = normalizeClassName(parsed.data.name).replace(STREAM_SUFFIX, "");
  const name = className(base, parsed.data.stream);
  for (const c of store.classes.values()) {
    if (c.id !== cls.id && c.instituteId === user.instituteId && normalizeClassName(c.name) === name) {
      return { error: `"${name}" already exists for this institute.` };
    }
  }
  const before = cls.name;
  cls.name = name;
  cls.code = parsed.data.code || undefined;
  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "class.update", entity: "Class", entityId: cls.id, meta: { before, after: name },
  });
  await saveStore();
}
