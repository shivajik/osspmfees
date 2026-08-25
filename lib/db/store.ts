/**
 * In-memory data store for preview / demo.
 * Replace with Prisma-backed repositories in production — the shape mirrors prisma/schema.prisma.
 */
import { hashSync } from "bcryptjs";
import { uid } from "@/lib/utils";
import { ROLES, type Role } from "@/lib/auth/rbac";

export interface Institute {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  instituteId: string | null;
  active: boolean;
  failedLoginCount: number;
  lockedUntil: number | null;
  /** Forces a password change on next login (seeded accounts, admin-assigned temp passwords). */
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AcademicYear {
  id: string; instituteId: string; name: string;
  startDate: string; endDate: string; isActive: boolean; createdAt: string;
}
export interface ClassRecord {
  id: string; instituteId: string; name: string; code?: string; createdAt: string;
}
export interface Batch {
  id: string; instituteId: string; classId: string; academicYearId: string; name: string; createdAt: string;
}
export interface Student {
  id: string; instituteId: string; admissionNo: string; name: string;
  guardianName?: string; phone?: string; email?: string;
  classId: string; batchId: string; academicYearId: string;
  status: "ACTIVE" | "INACTIVE"; createdAt: string;
}

export interface FeeStructure {
  id: string; instituteId: string; academicYearId: string; classId: string;
  name: string; totalAmount: number; dueDate?: string;
  items: { head: string; amount: number }[];
  createdAt: string;
}
export interface FeeAssignment {
  id: string; instituteId: string; studentId: string; feeStructureId: string;
  /** Denormalised for year-wise ledgers (copied from the fee structure). */
  academicYearId?: string;
  discount: number;
  /** Who approved / applied the discount. */
  discountBy?: string; discountByName?: string; discountReason?: string;
  /** Outstanding carried forward from earlier academic years at assignment time. */
  previousBalance?: number;
  /** Assignment ids whose balance was rolled into previousBalance. */
  carriedFrom?: string[];
  /** Set on an old assignment once its balance was carried into a newer year. */
  carriedForwardTo?: string;
  totalPayable: number; totalPaid: number;
  /** Total concessions granted at the collection counter (part of totalPaid). */
  collectionDiscount?: number;
  status: "PENDING" | "PARTIAL" | "PAID"; createdAt: string; updatedAt?: string;
}
export type PaymentMode = "CASH" | "BANK" | "CARD" | "UPI" | "CHEQUE" | "ONLINE";
export interface ChequeDetails {
  chequeNo: string; chequeDate: string; bankName: string; branch?: string;
}
export interface FeePayment {
  id: string; instituteId: string; assignmentId: string; studentId: string;
  receiptNo: string; amount: number; mode: PaymentMode; accountId?: string;
  /** Fee type head this payment was collected against (summary of the breakup). */
  feeHead?: string;
  /** Per-head split when a payment settles multiple fee heads at once. */
  feeHeadBreakup?: { head: string; amount: number }[];

  /** Split of this payment across carried-forward dues and the current year. */
  appliedToPrevious?: number; appliedToCurrent?: number;
  /** Concession granted at the counter — settles dues without cash movement. */
  discount?: number; discountBy?: string; discountByName?: string; discountReason?: string;
  cheque?: ChequeDetails;
  reference?: string; paidAt: string; createdBy: string; createdByName: string;
  updatedAt?: string; updatedBy?: string; updatedByName?: string;
}

export interface ExpenseCategory {
  id: string; instituteId: string; name: string; createdAt: string; updatedAt?: string;
}
export interface Expense {
  id: string; instituteId: string; categoryId: string;
  voucherNo: string; description: string; amount: number;
  spentAt: string; mode: PaymentMode; accountId?: string;
  cheque?: ChequeDetails;
  status: "PAID" | "DRAFT"; createdAt: string; createdBy: string;
  updatedAt?: string; updatedBy?: string; updatedByName?: string;
}


export interface Account {
  id: string; instituteId: string; name: string;
  type: "BANK" | "CASH"; bankName?: string; accountNo?: string; ifsc?: string;
  openingBal: number; currentBal: number; createdAt: string;
}
export interface Transaction {
  id: string; instituteId: string; accountId: string;
  direction: "CREDIT" | "DEBIT"; amount: number; balanceAfter: number;
  reference?: string; paymentId?: string; expenseId?: string;
  occurredAt: string; createdAt: string;
}

export interface AuditLog {
  id: string; instituteId: string | null; actorId: string; actorEmail: string;
  action: string; entity: string; entityId?: string;
  meta?: Record<string, unknown>; ip?: string; createdAt: string;
}

export type Store = {
  institutes: Map<string, Institute>;
  users: Map<string, User>;
  refreshTokens: Map<string, { userId: string; createdAt: number }>;
  passwordResets: Map<string, { userId: string; expiresAt: number; usedAt: number | null }>;
  academicYears: Map<string, AcademicYear>;
  classes: Map<string, ClassRecord>;
  batches: Map<string, Batch>;
  students: Map<string, Student>;
  feeStructures: Map<string, FeeStructure>;
  feeAssignments: Map<string, FeeAssignment>;
  feePayments: Map<string, FeePayment>;
  expenseCategories: Map<string, ExpenseCategory>;
  expenses: Map<string, Expense>;
  accounts: Map<string, Account>;
  transactions: Map<string, Transaction>;
  receiptCounter: number;
  voucherCounter: number;
  auditLogs: AuditLog[];
};

const g = globalThis as unknown as { __ledgerly_store?: Store };

function seed(): Store {
  const now = new Date().toISOString();

  const institutes = new Map<string, Institute>();
  const users = new Map<string, User>();
  const academicYears = new Map<string, AcademicYear>();
  const classes = new Map<string, ClassRecord>();
  const batches = new Map<string, Batch>();
  const students = new Map<string, Student>();
  const feeStructures = new Map<string, FeeStructure>();
  const feeAssignments = new Map<string, FeeAssignment>();
  const feePayments = new Map<string, FeePayment>();
  const expenseCategories = new Map<string, ExpenseCategory>();
  const expenses = new Map<string, Expense>();
  const accounts = new Map<string, Account>();
  const transactions = new Map<string, Transaction>();

  const pw = hashSync("Password123!", 10);

  // OSSPM Mandal — Om Shivkrupa Shikshan Prasarak Mandal branches
  // Source: https://www.osspmandal.com/branches
  const osspmBranches: Array<{ code: string; name: string; address: string }> = [
    { code: "VGGSS", name: "Late. Vimalbai G. Gaikwad Secondary School", address: "Gaikwad Jalgaon, Tq. Shevgaon, Dist. Ahilyanagar" },
    { code: "KDSS",  name: "Late. Kishanrao Dhanve Secondary School",   address: "Bharadi, Tq. Ambad, Dist. Jalna" },
    { code: "SSR",   name: "Secondary School, Rui",                     address: "Rui, Tq. Ambad, Dist. Jalna" },
    { code: "SSSS",  name: "Shree Shaneshwar Secondary School",         address: "Limbe Jalgaon, Tq. Gangapur, Dist. Chhatrapati Sambhajinagar" },
    { code: "OBM",   name: "Om Balak Mandir",                           address: "Sahakar Nagar, Chhatrapati Sambhajinagar" },
    { code: "OSS",   name: "Om Secondary School",                       address: "Sahakar Nagar, Chhatrapati Sambhajinagar" },
    { code: "GPES",  name: "Late. Gangadhar Patil English School",      address: "Gaikwad Jalgaon, Tq. Shevgaon, Dist. Ahilyanagar" },
    { code: "SESR",  name: "Sai English School, Rui",                   address: "Rui, Tq. Ambad, Dist. Jalna" },
    { code: "THS",   name: "The Tesla High School",                     address: "Deolai Area, Chhatrapati Sambhajinagar" },
    { code: "VGHSS", name: "Late. Vimalbai G. Gaikwad Sec & Higher Secondary School", address: "Gaikwad Jalgaon, Tq. Shevgaon, Dist. Ahilyanagar" },
    { code: "AJC",   name: "Adarsh Junior College",                     address: "Gaikwad Jalgaon, Tq. Shevgaon, Dist. Ahilyanagar" },
    { code: "SSHSS", name: "Shree Shaneshwar Higher Secondary School",  address: "Limbe Jalgaon, Tq. Gangapur, Dist. Chhatrapati Sambhajinagar" },
  ];

  const mk = (email: string, name: string, role: Role, instituteId: string | null): User => ({
    id: `usr_${email.replace(/[^a-z0-9]/gi, "_").toLowerCase()}`,
    email, name, passwordHash: pw, role, instituteId,
    active: true, failedLoginCount: 0, lockedUntil: null, mustChangePassword: true,
    createdAt: now, updatedAt: now,
  });

  // Super admin for OSSPM Mandal
  const superUser = mk("super@osspmandal.com", "OSSPM Super Admin", ROLES.SUPER_ADMIN, null);
  users.set(superUser.id, superUser);

  for (const b of osspmBranches) {
    const id = `inst_${b.code.toLowerCase()}`;
    institutes.set(id, {
      id, name: b.name, code: b.code,
      address: b.address, email: `${b.code.toLowerCase()}@osspmandal.com`,
      phone: undefined,
      status: "ACTIVE", createdAt: now, updatedAt: now,
    });

    const slug = b.code.toLowerCase();
    const branchUsers: User[] = [
      mk(`admin.${slug}@osspmandal.com`,      `${b.name} — Admin`,      ROLES.INSTITUTE_ADMIN, id),
      mk(`accountant.${slug}@osspmandal.com`, `${b.name} — Accountant`, ROLES.ACCOUNTANT,      id),
      mk(`cashier.${slug}@osspmandal.com`,    `${b.name} — Cashier`,    ROLES.CASHIER,         id),
    ];
    branchUsers.forEach((u) => users.set(u.id, u));

    // Minimal per-institute scaffolding: an active academic year + a cash account
    const ayId = `ay_${slug}_2526`;
    academicYears.set(ayId, {
      id: ayId, instituteId: id, name: "2025-26",
      startDate: "2025-06-01", endDate: "2026-05-31", isActive: true, createdAt: now,
    });
    const cashId = `ac_${slug}_cash`;
    accounts.set(cashId, {
      id: cashId, instituteId: id, name: "Cash in Hand",
      type: "CASH", openingBal: 0, currentBal: 0, createdAt: now,
    });
  }

  return {
    institutes, users, refreshTokens: new Map(), passwordResets: new Map(),
    academicYears, classes, batches, students,
    feeStructures, feeAssignments, feePayments,
    expenseCategories, expenses, accounts, transactions,
    receiptCounter: 1000, voucherCounter: 500,
    auditLogs: [],
  };
}

export const store: Store = g.__ledgerly_store ?? (g.__ledgerly_store = seed());

type StoreState = Omit<Store, "receiptCounter" | "voucherCounter" | "auditLogs"> & {
  receiptCounter: number;
  voucherCounter: number;
  auditLogs: AuditLog[];
};

const mapKeys: Array<keyof Omit<StoreState, "receiptCounter" | "voucherCounter" | "auditLogs">> = [
  "institutes", "users", "refreshTokens", "passwordResets", "academicYears", "classes",
  "batches", "students", "feeStructures", "feeAssignments", "feePayments",
  "expenseCategories", "expenses", "accounts", "transactions",
];

export function exportStoreState(): Record<string, unknown> {
  const state: Record<string, unknown> = {
    receiptCounter: store.receiptCounter,
    voucherCounter: store.voucherCounter,
    auditLogs: store.auditLogs,
  };
  for (const key of mapKeys) {
    const map = store[key] as Map<string, unknown>;
    state[key] = Array.from(map.entries());
  }
  return state;
}

export function importStoreState(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const state = value as Record<string, unknown>;
  for (const key of mapKeys) {
    const entries = state[key];
    if (Array.isArray(entries)) {
      (store[key] as Map<string, unknown>).clear();
      for (const entry of entries) {
        if (Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string") {
          let record = entry[1];
          // Legacy snapshots predate `mustChangePassword`; default missing
          // values to true so accounts persisted before this field existed
          // are still forced to rotate off the shared seed password.
          if (key === "users" && record && typeof record === "object" && typeof (record as User).mustChangePassword !== "boolean") {
            record = { ...(record as User), mustChangePassword: true };
          }
          (store[key] as Map<string, unknown>).set(entry[0], record);
        }
      }
    }
  }
  if (typeof state.receiptCounter === "number") store.receiptCounter = state.receiptCounter;
  if (typeof state.voucherCounter === "number") store.voucherCounter = state.voucherCounter;
  if (Array.isArray(state.auditLogs)) store.auditLogs = state.auditLogs as AuditLog[];
}

export function findUserByEmail(email: string): User | undefined {
  for (const u of store.users.values()) if (u.email.toLowerCase() === email.toLowerCase()) return u;
}

export function scopeByInstitute<T extends { instituteId: string }>(rows: Iterable<T>, instituteId: string | null): T[] {
  const arr = Array.from(rows);
  if (instituteId === null) return arr;
  return arr.filter((r) => r.instituteId === instituteId);
}

export function pushAudit(entry: Omit<AuditLog, "id" | "createdAt">) {
  store.auditLogs.unshift({ ...entry, id: uid("aud"), createdAt: new Date().toISOString() });
  if (store.auditLogs.length > 500) store.auditLogs.length = 500;
}

export function nextReceiptNo(): string {
  store.receiptCounter += 1;
  return `RCP-${store.receiptCounter}`;
}
export function nextVoucherNo(): string {
  store.voucherCounter += 1;
  return `VCH-${store.voucherCounter}`;
}

// ---------------------------------------------------------------------------
// Fee ledger helpers (previous balance / year-wise dues)
// ---------------------------------------------------------------------------

/** Academic year of an assignment, falling back to its fee structure. */
export function assignmentYearId(a: FeeAssignment): string {
  return a.academicYearId ?? store.feeStructures.get(a.feeStructureId)?.academicYearId ?? "";
}

/** Current-year payable + carried-forward previous balance. */
export function grossPayable(a: FeeAssignment): number {
  return a.totalPayable + (a.previousBalance ?? 0);
}

/** Outstanding on an assignment (0 once the balance has been carried forward). */
export function assignmentBalance(a: FeeAssignment): number {
  if (a.carriedForwardTo) return 0;
  return Math.max(0, grossPayable(a) - a.totalPaid);
}

export function assignmentStatusFor(a: FeeAssignment): "PENDING" | "PARTIAL" | "PAID" {
  if (a.totalPaid <= 0) return "PENDING";
  return a.totalPaid >= grossPayable(a) ? "PAID" : "PARTIAL";
}

/** Chronological sort key for an academic year (start date, then name). */
export function yearSortKey(yearId: string): string {
  const y = store.academicYears.get(yearId);
  return `${y?.startDate ?? "9999"}-${y?.name ?? yearId}`;
}

export interface LedgerRow {
  assignment: FeeAssignment;
  yearId: string;
  yearName: string;
  structureName: string;
  previousBalance: number;
  currentFees: number;
  discount: number;
  grossPayable: number;
  paid: number;
  balance: number;
  carriedForward: boolean;
}

/** Year-wise fee ledger for a student, oldest year first. */
export function studentLedger(studentId: string): LedgerRow[] {
  return Array.from(store.feeAssignments.values())
    .filter((a) => a.studentId === studentId)
    .sort((a, b) => yearSortKey(assignmentYearId(a)).localeCompare(yearSortKey(assignmentYearId(b))))
    .map((a) => {
      const yearId = assignmentYearId(a);
      const fs = store.feeStructures.get(a.feeStructureId);
      return {
        assignment: a,
        yearId,
        yearName: store.academicYears.get(yearId)?.name ?? "—",
        structureName: fs?.name ?? "—",
        previousBalance: a.previousBalance ?? 0,
        currentFees: a.totalPayable,
        discount: a.discount,
        grossPayable: grossPayable(a),
        paid: a.totalPaid,
        balance: assignmentBalance(a),
        carriedForward: !!a.carriedForwardTo,
      };
    });
}

/**
 * Open assignments from academic years earlier than `yearId` whose balance has
 * not yet been carried forward — these become the "previous balance".
 */
export function openPriorAssignments(studentId: string, yearId: string): FeeAssignment[] {
  const key = yearSortKey(yearId);
  return Array.from(store.feeAssignments.values()).filter((a) => {
    if (a.studentId !== studentId) return false;
    if (a.carriedForwardTo) return false;
    const ay = assignmentYearId(a);
    if (!ay || ay === yearId) return false;
    if (yearSortKey(ay).localeCompare(key) >= 0) return false;
    return assignmentBalance(a) > 0;
  });
}
