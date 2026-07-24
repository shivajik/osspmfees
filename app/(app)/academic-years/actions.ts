"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { pushAudit, store } from "@/lib/db/store";
import { uid } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(2).max(20),
  startDate: z.string().min(4),
  endDate: z.string().min(4),
  isActive: z.string().optional(),
});

export async function createAcademicYear(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  if (!hasPermission(permissionsForRole(user.role), PERMISSIONS.ACADEMIC_YEAR_WRITE)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Only institute users can create academic years" };
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid data" };

  const now = new Date().toISOString();
  const id = uid("ay");
  const isActive = parsed.data.isActive === "on";
  if (isActive) {
    for (const ay of store.academicYears.values()) {
      if (ay.instituteId === user.instituteId) ay.isActive = false;
    }
  }
  store.academicYears.set(id, {
    id,
    instituteId: user.instituteId,
    name: parsed.data.name,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
    isActive,
    createdAt: now,
  });
  pushAudit({
    instituteId: user.instituteId,
    actorId: user.id, actorEmail: user.email,
    action: "academic_year.create", entity: "AcademicYear", entityId: id,
    meta: { name: parsed.data.name },
  });
}
