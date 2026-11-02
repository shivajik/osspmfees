"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { pushAudit, store } from "@/lib/db/store";
import { uid } from "@/lib/utils";
import { saveStore } from "@/lib/db/persistence";
import { setStudentFee } from "../fees/actions";

const schema = z.object({
  admissionNo: z.string().min(1).max(40),
  name: z.string().min(2).max(120),
  guardianName: z.string().max(120).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  email: z.string().email().max(200).optional().or(z.literal("")),
  classId: z.string().min(1),
  batchId: z.string().min(1),
  academicYearId: z.string().min(1),
});

/** Optional fee captured while enrolling; blank means "set it later". */
const enrollFeeSchema = z.object({
  /** Fee heads from the editor ("Head:amount, ..."); blank = set fees later. */
  items: z.string().max(2000).optional().or(z.literal("")),
  feePaid: z.coerce.number().int().min(0).max(10_000_000).optional().default(0),
});

export async function createStudent(fd: FormData): Promise<{ error?: string; studentId?: string } | void> {
  const user = await requireUser();
  if (!hasPermission(permissionsForRole(user.role), PERMISSIONS.STUDENT_WRITE)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };

  const cls = store.classes.get(parsed.data.classId);
  const bat = store.batches.get(parsed.data.batchId);
  const ay = store.academicYears.get(parsed.data.academicYearId);
  if (!cls || cls.instituteId !== user.instituteId) return { error: "Invalid class" };
  if (!bat || bat.instituteId !== user.instituteId || bat.classId !== cls.id) return { error: "Invalid batch" };
  if (!ay || ay.instituteId !== user.instituteId) return { error: "Invalid year" };
  const fee = enrollFeeSchema.safeParse(Object.fromEntries(fd));
  if (!fee.success) return { error: "Enter fees as whole rupees" };
  const feeAmount = (fee.data.items ?? "").split(",").reduce((sum, part) => sum + Math.max(0, Number(part.split(":")[1]) || 0), 0);
  if (fee.data.feePaid > 0 && feeAmount <= 0) return { error: "Enter the fee before the amount already paid" };
  if (fee.data.feePaid > feeAmount) return { error: "Already-paid amount is more than the fee" };

  for (const s of store.students.values()) {
    if (s.instituteId === user.instituteId && s.admissionNo.toLowerCase() === parsed.data.admissionNo.toLowerCase()) {
      return { error: "Admission number already used" };
    }
  }

  const id = uid("stu");
  store.students.set(id, {
    id,
    instituteId: user.instituteId,
    admissionNo: parsed.data.admissionNo,
    name: parsed.data.name,
    guardianName: parsed.data.guardianName || undefined,
    phone: parsed.data.phone || undefined,
    email: parsed.data.email || undefined,
    classId: parsed.data.classId,
    batchId: parsed.data.batchId,
    academicYearId: parsed.data.academicYearId,
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
  });

  // The class structure is never charged silently — no two students pay the
  // same in these schools. Staff may type this student's fee (and anything
  // already paid) right here, or leave it for the collection counter.

  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "student.create", entity: "Student", entityId: id, meta: { admissionNo: parsed.data.admissionNo },
  });
  await saveStore();

  if (feeAmount > 0) {
    const f = new FormData();
    f.set("studentId", id);
    f.set("academicYearId", parsed.data.academicYearId);
    f.set("items", fee.data.items ?? "");
    f.set("paid", String(fee.data.feePaid));
    const r = await setStudentFee(f);
    if (r.error) return { studentId: id, error: `Student added, but ${r.error.charAt(0).toLowerCase()}${r.error.slice(1)}` };
  }
  return { studentId: id };
}

const updateSchema = schema.extend({
  id: z.string().min(1),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export async function updateStudent(fd: FormData): Promise<{ error?: string } | void> {
  const user = await requireUser();
  if (!hasPermission(permissionsForRole(user.role), PERMISSIONS.STUDENT_WRITE)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };

  const parsed = updateSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };
  const d = parsed.data;

  const student = store.students.get(d.id);
  if (!student || student.instituteId !== user.instituteId) return { error: "Student not found" };

  const cls = store.classes.get(d.classId);
  const bat = store.batches.get(d.batchId);
  const ay = store.academicYears.get(d.academicYearId);
  if (!cls || cls.instituteId !== user.instituteId) return { error: "Invalid class" };
  if (!bat || bat.instituteId !== user.instituteId || bat.classId !== cls.id) return { error: "Invalid batch" };
  if (!ay || ay.instituteId !== user.instituteId) return { error: "Invalid year" };

  for (const s of store.students.values()) {
    if (s.id === student.id) continue;
    if (s.instituteId === user.instituteId && s.admissionNo.toLowerCase() === d.admissionNo.toLowerCase()) {
      return { error: "Admission number already used" };
    }
  }

  student.admissionNo = d.admissionNo;
  student.name = d.name;
  student.guardianName = d.guardianName || undefined;
  student.phone = d.phone || undefined;
  student.email = d.email || undefined;
  student.classId = d.classId;
  student.batchId = d.batchId;
  student.academicYearId = d.academicYearId;
  student.status = d.status;

  pushAudit({
    instituteId: user.instituteId, actorId: user.id, actorEmail: user.email,
    action: "student.update", entity: "Student", entityId: student.id,
    meta: { admissionNo: student.admissionNo, name: student.name, status: student.status },
  });
  await saveStore();
}
