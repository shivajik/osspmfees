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

const updateSchema = schema.extend({
  id: z.string().min(1),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export async function updateInstitute(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  if (user.role !== ROLES.SUPER_ADMIN) return { error: "Not authorized" };

  const parsed = updateSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid data" };
  const { id, name, code, email, phone, address, status } = parsed.data;

  const inst = store.institutes.get(id);
  if (!inst) return { error: "Institute not found" };
  for (const other of store.institutes.values()) {
    if (other.id !== id && other.code.toLowerCase() === code.toLowerCase()) {
      return { error: "Code already in use" };
    }
  }

  inst.name = name;
  inst.code = code.toUpperCase();
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
