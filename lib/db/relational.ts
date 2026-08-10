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

/**
 * Column map of the live database, read from the PostgREST OpenAPI document.
 * The mirror uses it to (a) skip tables that don't exist yet and (b) drop keys
 * the table doesn't have, so one stale column can't reject a whole batch.
 */
let columnsCache: { at: number; map: Map<string, Set<string>> } | null = null;

async function liveColumns(base: string, key: string): Promise<Map<string, Set<string>>> {
  if (columnsCache && Date.now() - columnsCache.at < 60_000) return columnsCache.map;
  const map = new Map<string, Set<string>>();
  try {
    const res = await fetch(`${base}/rest/v1/`, { headers: headers(key), cache: "no-store" });
    if (res.ok) {
      const spec = (await res.json()) as {
        definitions?: Record<string, { properties?: Record<string, unknown> }>;
        components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> };
      };
      const defs = spec.definitions ?? spec.components?.schemas ?? {};
      for (const [table, def] of Object.entries(defs)) {
        const props = def?.properties ? Object.keys(def.properties) : [];
        if (props.length > 0) map.set(table, new Set(props));
      }
    }
  } catch {
    // Unreachable spec → mirror without filtering (best effort).
  }
  columnsCache = { at: Date.now(), map };
  return map;
}

function project(row: Row, cols: Set<string> | undefined): Row {
  if (!cols) return row;
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) if (cols.has(k)) out[k] = v;
  return out;
}

async function post(base: string, key: string, table: string, rows: Row[]): Promise<void> {
  const res = await fetch(`${base}/rest/v1/${encodeURIComponent(table)}?on_conflict=id`, {
    method: "POST",
    headers: headers(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(rows),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 400)}`);
}

/** Upsert in chunks; if a chunk fails, retry its rows one by one so a single
 *  bad record (FK violation, oversized value) cannot drop the whole table. */
async function upsert(
  base: string,
  key: string,
  table: string,
  rows: Row[],
): Promise<{ written: number; errors: string[] }> {
  if (rows.length === 0) return { written: 0, errors: [] };
  const chunkSize = 500;
  const chunks: Row[][] = [];
  for (let i = 0; i < rows.length; i += chunkSize) chunks.push(rows.slice(i, i + chunkSize));

  let written = 0;
  const errors: string[] = [];

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        await post(base, key, table, chunk);
        written += chunk.length;
      } catch (batchError) {
        const batchMessage = (batchError as Error).message;
        // Permission / missing-table errors fail identically for every row —
        // don't hammer the API with N single-row retries.
        if (/^(401|403|404)\b/.test(batchMessage)) {
          errors.push(batchMessage);
          return;
        }
        for (const row of chunk) {
          try {
            await post(base, key, table, [row]);
            written += 1;
          } catch (rowError) {
            if (errors.length < 5) {
              errors.push(`id=${String(row.id)}: ${(rowError as Error).message}`);
            }
          }
        }
      }
    }),
  );

  return { written, errors };
}

export interface MirrorResult {
  table: string;
  rows: number;
  written: number;
  ok: boolean;
  missing?: boolean;
  error?: string;
}

/**
 * Foreign-key waves: tables inside a wave have no dependency on each other, so
 * they are mirrored in parallel; waves run in order.
 */
const WAVES: string[][] = [
  ["Institute"],
  ["User", "AcademicYear", "Class", "Account", "ExpenseCategory"],
  ["Batch", "FeeStructure"],
  ["Student", "FeeStructureItem", "Expense"],
  ["FeeAssignment"],
  ["FeePayment"],
  ["Transaction", "AuditLog"],
];

let inFlight: Promise<MirrorResult[]> = Promise.resolve([]);
let lastReport: { at: string; results: MirrorResult[] } | null = null;

/** Most recent mirror outcome (for diagnostics via /api/admin/sync). */
export function lastMirrorReport() {
  return lastReport;
}

/**
 * Mirror the whole store into its relational tables (serialized per request).
 * Returns a per-table report; failures are logged, never thrown, so a mirror
 * problem cannot block a user action — but it IS visible via /api/admin/sync.
 */
export function mirrorToTables(): Promise<MirrorResult[]> {
  const c = cfg();
  if (!c) return Promise.resolve([]);

  const snapshot = tables();
  const byName = new Map(snapshot.map((t) => [t.name, t.rows]));

  inFlight = inFlight.then(async () => {
    const report: MirrorResult[] = [];
    const cols = await liveColumns(c.url, c.key);

    for (const wave of WAVES) {
      await Promise.all(
        wave.map(async (name) => {
          const rows = byName.get(name) ?? [];
          if (cols.size > 0 && !cols.has(name)) {
            report.push({
              table: name,
              rows: rows.length,
              written: 0,
              ok: false,
              missing: true,
              error:
                "Table is not exposed by the Data API — create it and grant service_role (see scripts/sql/ledgerly-relational-tables.sql).",
            });
            console.error(`[relational-mirror] MISSING TABLE ${name}`);
            return;
          }
          const projected = rows.map((r) => project(r, cols.get(name)));
          const { written, errors } = await upsert(c.url, c.key, name, projected);
          const ok = errors.length === 0;
          if (!ok) console.error(`[relational-mirror] ${name}: ${errors.join(" | ")}`);
          report.push({
            table: name,
            rows: rows.length,
            written,
            ok,
            error: ok ? undefined : errors.join(" | "),
          });
        }),
      );
    }

    lastReport = { at: new Date().toISOString(), results: report };
    return report;
  }).catch((error) => {
    console.error("[relational-mirror] fatal:", (error as Error).message);
    return [];
  });
  return inFlight;
}



