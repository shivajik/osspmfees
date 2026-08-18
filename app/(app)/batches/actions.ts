"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { pushAudit, store } from "@/lib/db/store";
import { uid } from "@/lib/utils";
import { saveStore } from "@/lib/db/persistence";

const schema = z.object({
  name: z.string().min(1).max(40),
  classId: z.string().min(1),
  academicYearId: z.string().min(1),
});

export async function createBatch(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  if (!hasPermission(permissionsForRole(user.role), PERMISSIONS.BATCH_WRITE)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };

  const cls = store.classes.get(parsed.data.classId);
  const ay = store.academicYears.get(parsed.data.academicYearId);
  if (!cls || cls.instituteId !== user.instituteId) return { error: "Invalid class" };
  if (!ay || ay.instituteId !== user.instituteId) return { error: "Invalid academic year" };

  const wanted = parsed.data.name.trim().toLowerCase();
  for (const b of store.batches.values()) {
    if (
      b.instituteId === user.instituteId &&
      b.classId === parsed.data.classId &&
      b.academicYearId === parsed.data.academicYearId &&
      b.name.trim().toLowerCase() === wanted
    ) {
      return { error: `Division "${parsed.data.name}" already exists for ${cls.name} in this academic year.` };
    }
  }

  const id = uid("bt");

  store.batches.set(id, {
    id, instituteId: user.instituteId,
    name: parsed.data.name, classId: parsed.data.classId, academicYearId: parsed.data.academicYearId,
    createdAt: new Date().toISOString(),
  });
  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "batch.create", entity: "Batch", entityId: id, meta: { name: parsed.data.name },
  });
  await saveStore();
}
