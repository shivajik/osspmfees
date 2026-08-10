import "server-only";
import { store } from "@/lib/db/store";

/**
 * Relational mirror.
 *
 * The app keeps its working set in `lib/db/store.ts` and snapshots it to
 * `ledgerly_app_state` (fast, atomic, versioned). That snapshot is not
 * queryable, so every entity is *also* written to its own table
 * (Institute, User, Student, FeePayment, ...) via the Data API, using the
 * column set from `prisma/schema.prisma`.
 *
 * Writes are best-effort: a mirror failure never blocks a user action.
 */

type Row = Record<string, unknown>;

function cfg() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function headers(key: string, extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("apikey", key);
  if (key.split(".").length === 3) h.set("Authorization", `Bearer ${key}`);
  h.set("Content-Type", "application/json");
  return h;
}

/** ISO timestamp or null — accepts ISO strings, epoch millis, dates. */
function ts(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value === "string") {
    const d = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Tables in FK-safe order, each projecting store records onto real columns. */
function tables(): Array<{ name: string; rows: Row[] }> {
  const s = store;

  const feeStructures = Array.from(s.feeStructures.values());

  return [
    {
      name: "Institute",
      rows: Array.from(s.institutes.values()).map((i) => ({
        id: i.id, name: i.name, code: i.code,
        address: str(i.address), phone: str(i.phone), email: str(i.email),
        status: i.status, createdAt: ts(i.createdAt), updatedAt: ts(i.updatedAt),
      })),
    },
    {
      name: "User",
      rows: Array.from(s.users.values()).map((u) => ({
        id: u.id, email: u.email, name: u.name, passwordHash: u.passwordHash,
        role: u.role, instituteId: u.instituteId, active: u.active,
        failedLoginCount: u.failedLoginCount, lockedUntil: ts(u.lockedUntil),
        createdAt: ts(u.createdAt), updatedAt: ts(u.updatedAt),
      })),
    },
    {
      name: "AcademicYear",
      rows: Array.from(s.academicYears.values()).map((a) => ({
        id: a.id, instituteId: a.instituteId, name: a.name,
        startDate: ts(a.startDate), endDate: ts(a.endDate), isActive: a.isActive,
        createdAt: ts(a.createdAt), updatedAt: ts(a.createdAt),
      })),
    },
    {
      name: "Class",
      rows: Array.from(s.classes.values()).map((c) => ({
        id: c.id, instituteId: c.instituteId, name: c.name, code: str(c.code),
        createdAt: ts(c.createdAt), updatedAt: ts(c.createdAt),
      })),
    },
    {
      name: "Batch",
      rows: Array.from(s.batches.values()).map((b) => ({
        id: b.id, instituteId: b.instituteId, classId: b.classId,
        academicYearId: b.academicYearId, name: b.name,
        createdAt: ts(b.createdAt), updatedAt: ts(b.createdAt),
      })),
    },
    {
      name: "Student",
      rows: Array.from(s.students.values()).map((st) => ({
        id: st.id, instituteId: st.instituteId, admissionNo: st.admissionNo, name: st.name,
        guardianName: str(st.guardianName), phone: str(st.phone), email: str(st.email),
        classId: st.classId, batchId: st.batchId, academicYearId: st.academicYearId,
        status: st.status, createdAt: ts(st.createdAt), updatedAt: ts(st.createdAt),
      })),
    },
    {
      name: "FeeStructure",
      rows: feeStructures.map((f) => ({
        id: f.id, instituteId: f.instituteId, academicYearId: f.academicYearId,
        classId: f.classId, name: f.name, totalAmount: num(f.totalAmount),
        dueDate: ts(f.dueDate), createdAt: ts(f.createdAt), updatedAt: ts(f.createdAt),
      })),
    },
    {
      name: "FeeStructureItem",
      rows: feeStructures.flatMap((f) =>
        (f.items ?? []).map((it, idx) => ({
          id: `${f.id}_item_${idx}`, feeStructureId: f.id,
          head: it.head, amount: num(it.amount),
        })),
      ),
    },
    {
      name: "Account",
      rows: Array.from(s.accounts.values()).map((a) => ({
        id: a.id, instituteId: a.instituteId, name: a.name, type: a.type,
        bankName: str(a.bankName), accountNo: str(a.accountNo), ifsc: str(a.ifsc),
        openingBal: num(a.openingBal), currentBal: num(a.currentBal),
        createdAt: ts(a.createdAt), updatedAt: ts(a.createdAt),
      })),
    },
    {
      name: "FeeAssignment",
      rows: Array.from(s.feeAssignments.values()).map((a) => ({
        id: a.id, instituteId: a.instituteId, studentId: a.studentId,
        feeStructureId: a.feeStructureId, discount: num(a.discount),
        totalPayable: num(a.totalPayable), totalPaid: num(a.totalPaid),
        status: a.status, createdAt: ts(a.createdAt), updatedAt: ts(a.updatedAt ?? a.createdAt),
      })),
    },
    {
      name: "FeePayment",
      rows: Array.from(s.feePayments.values()).map((p) => ({
        id: p.id, instituteId: p.instituteId, assignmentId: p.assignmentId,
        studentId: p.studentId, receiptNo: p.receiptNo, amount: num(p.amount),
        mode: p.mode, accountId: p.accountId ?? null,
        reference: str(p.reference), paidAt: ts(p.paidAt),
        createdAt: ts(p.paidAt), createdBy: str(p.createdBy),
      })),
    },
    {
      name: "ExpenseCategory",
      rows: Array.from(s.expenseCategories.values()).map((c) => ({
        id: c.id, instituteId: c.instituteId, name: c.name,
        createdAt: ts(c.createdAt), updatedAt: ts(c.updatedAt ?? c.createdAt),
      })),
    },
    {
      name: "Expense",
      rows: Array.from(s.expenses.values()).map((e) => ({
        id: e.id, instituteId: e.instituteId, categoryId: e.categoryId,
        voucherNo: e.voucherNo, description: e.description, amount: num(e.amount),
        spentAt: ts(e.spentAt), mode: e.mode, accountId: e.accountId ?? null,
        status: e.status, createdAt: ts(e.createdAt), updatedAt: ts(e.updatedAt ?? e.createdAt),
        createdBy: str(e.createdBy), updatedBy: str(e.updatedBy),
      })),
    },
    {
      name: "Transaction",
      rows: Array.from(s.transactions.values()).map((t) => ({
        id: t.id, instituteId: t.instituteId, accountId: t.accountId,
        direction: t.direction, amount: num(t.amount), balanceAfter: num(t.balanceAfter),
        reference: str(t.reference), paymentId: t.paymentId ?? null, expenseId: t.expenseId ?? null,
        occurredAt: ts(t.occurredAt), createdAt: ts(t.createdAt),
      })),
    },
    {
      name: "AuditLog",
      rows: s.auditLogs.map((a) => ({
        id: a.id, instituteId: a.instituteId, actorId: a.actorId, actorEmail: a.actorEmail,
        action: a.action, entity: a.entity, entityId: str(a.entityId),
        meta: a.meta ?? null, ip: str(a.ip), createdAt: ts(a.createdAt),
      })),
    },
  ];
}

async function upsert(base: string, key: string, table: string, rows: Row[]): Promise<void> {
  if (rows.length === 0) return;
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const res = await fetch(`${base}/rest/v1/${encodeURIComponent(table)}?on_conflict=id`, {
      method: "POST",
      headers: headers(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(chunk),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`${table}: ${res.status} ${await res.text()}`);
    }
  }
}

let inFlight: Promise<void> = Promise.resolve();

/** Mirror the whole store into its relational tables (best-effort, serialized). */
export function mirrorToTables(): Promise<void> {
  const c = cfg();
  if (!c) return Promise.resolve();

  const snapshot = tables();
  inFlight = inFlight.then(async () => {
    for (const t of snapshot) {
      try {
        await upsert(c.url, c.key, t.name, t.rows);
      } catch (error) {
        console.warn(`[relational-mirror] skipped ${t.name}:`, (error as Error).message);
      }
    }
  }).catch(() => {});
  return inFlight;
}
