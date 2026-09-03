"use server";
import { requireUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { pushAudit, store, assignmentStatusFor } from "@/lib/db/store";
import { uid } from "@/lib/utils";
import { saveStore } from "@/lib/db/persistence";
import { parseStudentWorkbook } from "@/lib/import/students";
import type { ImportSummary } from "@/lib/import/types";

const MAX_BYTES = 8 * 1024 * 1024;

export async function importStudents(fd: FormData): Promise<ImportSummary> {
  const user = await requireUser();
  const perms = permissionsForRole(user.role);
  if (!hasPermission(perms, PERMISSIONS.STUDENT_WRITE)) return { error: "Not authorized" };
  if (!user.instituteId) return { error: "Institute scope required" };
  const instituteId = user.instituteId;

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an Excel (.xlsx/.xls) or CSV file" };
  if (file.size > MAX_BYTES) return { error: "File is too large (max 8 MB)" };

  const academicYearId = String(fd.get("academicYearId") ?? "");
  const year = store.academicYears.get(academicYearId);
  if (!year || year.instituteId !== instituteId) return { error: "Choose a valid academic year" };

  const dryRun = String(fd.get("dryRun") ?? "") === "1";
  const importFees = String(fd.get("importFees") ?? "") === "1";
  const onDuplicate = String(fd.get("onDuplicate") ?? "autonumber") === "skip" ? "skip" : "autonumber";
  const defaults = {
    className: String(fd.get("defaultClass") ?? "").trim() || undefined,
    section: String(fd.get("defaultSection") ?? "").trim() || undefined,
  };


  let parsed;
  try {
    parsed = parseStudentWorkbook(await file.arrayBuffer(), defaults);
  } catch {
    return { error: "Could not read this file. Save it as .xlsx or .csv and try again." };
  }
  if (!parsed.rows.length) {
    return { error: "No student rows found.", errors: parsed.errors.slice(0, 20) };
  }

  const errors = [...parsed.errors];
  const summary: ImportSummary = {
    dryRun,
    parsed: parsed.rows.length,
    studentsCreated: 0,
    studentsUpdated: 0,
    classesCreated: [],
    batchesCreated: 0,
    feeAssignments: 0,
    feesTotal: 0,
    previousTotal: 0,
    discountTotal: 0,
  };

  // Resolves an admission number that already appeared earlier in the same file.
  // Default behaviour keeps the row and gives it a unique suffix; "skip" preserves
  // the old strict behaviour.
  const makeResolver = () => {
    const seen = new Set<string>();
    return (admissionNo: string, rowNo: number): string | null => {
      const key = admissionNo.toLowerCase();
      if (!seen.has(key)) { seen.add(key); return admissionNo; }
      if (onDuplicate === "skip") {
        errors.push(`Duplicate admission number "${admissionNo}" in the file (row ${rowNo}) — skipped.`);
        return null;
      }
      let n = 2;
      let candidate = `${admissionNo}-${n}`;
      while (seen.has(candidate.toLowerCase())) candidate = `${admissionNo}-${++n}`;
      seen.add(candidate.toLowerCase());
      errors.push(`Duplicate admission number "${admissionNo}" (row ${rowNo}) — imported as "${candidate}".`);
      return candidate;
    };
  };

  if (dryRun) {
    const resolve = makeResolver();
    for (const r of parsed.rows) {
      const admissionNo = resolve(r.admissionNo, r.rowNo);
      if (!admissionNo) continue;
      const existing = Array.from(store.students.values()).find(
        (s) => s.instituteId === instituteId && s.admissionNo.toLowerCase() === admissionNo.toLowerCase(),
      );
      if (existing) summary.studentsUpdated! += 1; else summary.studentsCreated! += 1;
      if (!Array.from(store.classes.values()).some((c) => c.instituteId === instituteId && c.name.toLowerCase() === r.className.toLowerCase())
        && !summary.classesCreated!.includes(r.className)) summary.classesCreated!.push(r.className);
      if (importFees && (r.assignedFee > 0 || r.previousBalance > 0 || r.discount > 0)) {
        summary.feeAssignments! += 1;
        summary.feesTotal! += r.assignedFee;
        summary.previousTotal! += r.previousBalance;
        summary.discountTotal! += r.discount;
      }
    }
    summary.errors = errors.slice(0, 20);
    summary.preview = parsed.rows.slice(0, 8).map((r) => ({
      admissionNo: r.admissionNo, name: r.name, className: r.className, section: r.section,
      phone: r.phone, previousBalance: r.previousBalance, assignedFee: r.assignedFee, discount: r.discount,
    }));
    return summary;
  }


  const now = new Date().toISOString();

  const findOrCreateClass = (name: string) => {
    const found = Array.from(store.classes.values()).find(
      (c) => c.instituteId === instituteId && c.name.toLowerCase() === name.toLowerCase(),
    );
    if (found) return found;
    const id = uid("cls");
    const rec = { id, instituteId, name, createdAt: now };
    store.classes.set(id, rec);
    summary.classesCreated!.push(name);
    return rec;
  };

  const findOrCreateBatch = (classId: string, name: string) => {
    const found = Array.from(store.batches.values()).find(
      (b) => b.instituteId === instituteId && b.classId === classId &&
        b.academicYearId === academicYearId && b.name.toLowerCase() === name.toLowerCase(),
    );
    if (found) return found;
    const id = uid("bat");
    const rec = { id, instituteId, classId, academicYearId, name, createdAt: now };
    store.batches.set(id, rec);
    summary.batchesCreated! += 1;
    return rec;
  };

  const findOrCreateStructure = (classId: string, className: string) => {
    const found = Array.from(store.feeStructures.values()).find(
      (f) => f.instituteId === instituteId && f.classId === classId && f.academicYearId === academicYearId,
    );
    if (found) return found;
    const id = uid("fs");
    const rec = {
      id, instituteId, academicYearId, classId,
      name: `${className} fees ${year.name}`,
      totalAmount: 0, items: [] as { head: string; amount: number }[], createdAt: now,
    };
    store.feeStructures.set(id, rec);
    return rec;
  };

  const resolve = makeResolver();
  for (const r of parsed.rows) {
    const admissionNo = resolve(r.admissionNo, r.rowNo);
    if (!admissionNo) continue;
    const key = admissionNo.toLowerCase();

    const cls = findOrCreateClass(r.className);
    const batch = findOrCreateBatch(cls.id, r.section);

    let student = Array.from(store.students.values()).find(
      (s) => s.instituteId === instituteId && s.admissionNo.toLowerCase() === key,
    );
    if (student) {
      student.name = r.name;
      student.classId = cls.id;
      student.batchId = batch.id;
      student.academicYearId = academicYearId;
      if (r.phone) student.phone = r.phone;
      if (r.guardianName) student.guardianName = r.guardianName;
      if (r.email) student.email = r.email;
      summary.studentsUpdated! += 1;
    } else {
      const id = uid("stu");
      student = {
        id, instituteId, admissionNo, name: r.name,

        guardianName: r.guardianName, phone: r.phone, email: r.email,
        classId: cls.id, batchId: batch.id, academicYearId,
        status: "ACTIVE" as const, createdAt: now,
      };
      store.students.set(id, student);
      summary.studentsCreated! += 1;
    }

    if (!importFees || (r.assignedFee <= 0 && r.previousBalance <= 0 && r.discount <= 0)) continue;

    const structure = findOrCreateStructure(cls.id, r.className);
    // A concession can be larger than this year's fee — school sheets apply the
    // discount to the whole outstanding ("Total Balance" = carried forward + this
    // year), and a pupil with no new fee may still be given relief on old dues.
    // Take what this year's fee can absorb, then apply the rest to the carried
    // forward balance; clamping at zero here would silently discard the remainder.
    const payable = Math.max(0, r.assignedFee - r.discount);
    const unabsorbed = Math.max(0, r.discount - r.assignedFee);
    const previousBalance = Math.max(0, r.previousBalance - unabsorbed);
    let assn = Array.from(store.feeAssignments.values()).find(
      (a) => a.studentId === student!.id && (a.academicYearId ?? "") === academicYearId,
    );
    if (assn) {
      if (assn.totalPaid > payable + previousBalance) {
        errors.push(`${r.name} (${r.admissionNo}): collected amount exceeds imported fees — fee row skipped.`);
        continue;
      }
      assn.feeStructureId = structure.id;
      assn.discount = r.discount;
      assn.previousBalance = previousBalance;
      assn.totalPayable = payable;
      assn.discountByName = assn.discount > 0 ? (assn.discountByName ?? user.name) : undefined;
      assn.discountReason = assn.discount > 0 ? (assn.discountReason ?? "Imported from spreadsheet") : undefined;
      assn.status = assignmentStatusFor(assn);
      assn.updatedAt = now;
    } else {
      const id = uid("fa");
      assn = {
        id, instituteId, studentId: student.id, feeStructureId: structure.id,
        academicYearId,
        discount: r.discount,
        discountBy: r.discount > 0 ? user.id : undefined,
        discountByName: r.discount > 0 ? user.name : undefined,
        discountReason: r.discount > 0 ? "Imported from spreadsheet" : undefined,
        previousBalance,
        totalPayable: payable, totalPaid: 0,
        status: "PENDING" as const, createdAt: now,
      };
      assn.status = assignmentStatusFor(assn);
      store.feeAssignments.set(id, assn);
    }
    summary.feeAssignments! += 1;
    summary.feesTotal! += r.assignedFee;
    summary.previousTotal! += r.previousBalance;
    summary.discountTotal! += r.discount;
  }

  pushAudit({
    instituteId, actorId: user.id, actorEmail: user.email,
    action: "student.import", entity: "Student",
    meta: {
      file: file.name, parsed: summary.parsed,
      created: summary.studentsCreated, updated: summary.studentsUpdated,
      feeAssignments: summary.feeAssignments, academicYear: year.name,
    },
  });
  await saveStore();

  summary.errors = errors.slice(0, 20);
  return summary;
}
