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
  discount: number; totalPayable: number; totalPaid: number;
  status: "PENDING" | "PARTIAL" | "PAID"; createdAt: string;
}
export type PaymentMode = "CASH" | "BANK" | "CARD" | "UPI" | "CHEQUE" | "ONLINE";
export interface FeePayment {
  id: string; instituteId: string; assignmentId: string; studentId: string;
  receiptNo: string; amount: number; mode: PaymentMode; accountId?: string;
  reference?: string; paidAt: string; createdBy: string; createdByName: string;
}

export interface ExpenseCategory {
  id: string; instituteId: string; name: string; createdAt: string;
}
export interface Expense {
  id: string; instituteId: string; categoryId: string;
  voucherNo: string; description: string; amount: number;
  spentAt: string; mode: PaymentMode; accountId?: string;
  status: "PAID" | "DRAFT"; createdAt: string; createdBy: string;
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

type Store = {
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

  const inst1: Institute = {
    id: "inst_greenwood", name: "Greenwood Public School", code: "GPS",
    address: "12 Park Ave, Bengaluru", phone: "+91 80 4000 1000", email: "office@greenwood.edu",
    status: "ACTIVE", createdAt: now, updatedAt: now,
  };
  const inst2: Institute = {
    id: "inst_northstar", name: "Northstar Academy", code: "NSA",
    address: "9 Ring Road, Pune", phone: "+91 20 4000 2000", email: "hello@northstar.edu",
    status: "ACTIVE", createdAt: now, updatedAt: now,
  };
  institutes.set(inst1.id, inst1);
  institutes.set(inst2.id, inst2);

  const pw = hashSync("Password123!", 10);
  const mk = (email: string, name: string, role: Role, instituteId: string | null): User => ({
    id: uid("usr"), email, name, passwordHash: pw, role, instituteId,
    active: true, failedLoginCount: 0, lockedUntil: null, createdAt: now, updatedAt: now,
  });

  const seedUsers: User[] = [
    mk("super@ledgerly.app", "Super Admin", ROLES.SUPER_ADMIN, null),
    mk("admin@greenwood.edu", "Greenwood Admin", ROLES.INSTITUTE_ADMIN, inst1.id),
    mk("accountant@greenwood.edu", "Greenwood Accountant", ROLES.ACCOUNTANT, inst1.id),
    mk("cashier@greenwood.edu", "Greenwood Cashier", ROLES.CASHIER, inst1.id),
    mk("viewer@greenwood.edu", "Greenwood Viewer", ROLES.VIEWER, inst1.id),
    mk("admin@northstar.edu", "Northstar Admin", ROLES.INSTITUTE_ADMIN, inst2.id),
  ];
  seedUsers.forEach((u) => users.set(u.id, u));

  const ay: AcademicYear = {
    id: "ay_gw_2526", instituteId: inst1.id, name: "2025-26",
    startDate: "2025-06-01", endDate: "2026-05-31", isActive: true, createdAt: now,
  };
  academicYears.set(ay.id, ay);

  const classesSeed: ClassRecord[] = [
    { id: "cls_gw_9", instituteId: inst1.id, name: "Grade 9", code: "9", createdAt: now },
    { id: "cls_gw_10", instituteId: inst1.id, name: "Grade 10", code: "10", createdAt: now },
    { id: "cls_gw_11", instituteId: inst1.id, name: "Grade 11", code: "11", createdAt: now },
  ];
  classesSeed.forEach((c) => classes.set(c.id, c));

  const batchesSeed: Batch[] = [
    { id: "bt_9a", instituteId: inst1.id, classId: "cls_gw_9", academicYearId: ay.id, name: "9-A", createdAt: now },
    { id: "bt_10a", instituteId: inst1.id, classId: "cls_gw_10", academicYearId: ay.id, name: "10-A", createdAt: now },
    { id: "bt_10b", instituteId: inst1.id, classId: "cls_gw_10", academicYearId: ay.id, name: "10-B", createdAt: now },
  ];
  batchesSeed.forEach((b) => batches.set(b.id, b));

  // Fee structures per class
  const structures: FeeStructure[] = [
    { id: "fs_gw_9", instituteId: inst1.id, academicYearId: ay.id, classId: "cls_gw_9",
      name: "Grade 9 Annual Fees", totalAmount: 45000,
      items: [{ head: "Tuition", amount: 30000 }, { head: "Development", amount: 8000 }, { head: "Exam", amount: 4000 }, { head: "Library", amount: 3000 }],
      createdAt: now },
    { id: "fs_gw_10", instituteId: inst1.id, academicYearId: ay.id, classId: "cls_gw_10",
      name: "Grade 10 Annual Fees", totalAmount: 52000,
      items: [{ head: "Tuition", amount: 35000 }, { head: "Development", amount: 9000 }, { head: "Exam", amount: 5000 }, { head: "Library", amount: 3000 }],
      createdAt: now },
    { id: "fs_gw_11", instituteId: inst1.id, academicYearId: ay.id, classId: "cls_gw_11",
      name: "Grade 11 Annual Fees", totalAmount: 62000,
      items: [{ head: "Tuition", amount: 44000 }, { head: "Lab", amount: 10000 }, { head: "Exam", amount: 5000 }, { head: "Library", amount: 3000 }],
      createdAt: now },
  ];
  structures.forEach((s) => feeStructures.set(s.id, s));

  // Accounts
  const acctBank: Account = {
    id: "ac_gw_bank", instituteId: inst1.id, name: "HDFC Current",
    type: "BANK", bankName: "HDFC Bank", accountNo: "50100XXXXXX", ifsc: "HDFC0000123",
    openingBal: 500000, currentBal: 500000, createdAt: now,
  };
  const acctCash: Account = {
    id: "ac_gw_cash", instituteId: inst1.id, name: "Cash in Hand",
    type: "CASH", openingBal: 25000, currentBal: 25000, createdAt: now,
  };
  accounts.set(acctBank.id, acctBank);
  accounts.set(acctCash.id, acctCash);

  // Expense categories
  const cats: ExpenseCategory[] = [
    { id: "ec_salary", instituteId: inst1.id, name: "Salaries", createdAt: now },
    { id: "ec_utils", instituteId: inst1.id, name: "Utilities", createdAt: now },
    { id: "ec_maint", instituteId: inst1.id, name: "Maintenance", createdAt: now },
    { id: "ec_sup", instituteId: inst1.id, name: "Supplies", createdAt: now },
  ];
  cats.forEach((c) => expenseCategories.set(c.id, c));

  // Students + auto assignments
  const names = ["Aarav Sharma", "Isha Patel", "Kabir Singh", "Meera Reddy", "Rohan Iyer", "Sara Kapoor", "Vivaan Mehta", "Zara Khan"];
  names.forEach((n, i) => {
    const classId = i % 2 === 0 ? "cls_gw_10" : "cls_gw_9";
    const batchId = i % 2 === 0 ? "bt_10a" : "bt_9a";
    const s: Student = {
      id: uid("stu"), instituteId: inst1.id,
      admissionNo: `GPS-${2500 + i}`, name: n,
      guardianName: n.split(" ")[1] ? `Mr. ${n.split(" ")[1]}` : undefined,
      phone: `+9199000${(10000 + i).toString().slice(-5)}`,
      email: `${n.toLowerCase().replace(/\s+/g, ".")}@greenwood.edu`,
      classId, batchId, academicYearId: ay.id, status: "ACTIVE", createdAt: now,
    };
    students.set(s.id, s);
    const fs = classId === "cls_gw_10" ? structures[1] : structures[0];
    const assn: FeeAssignment = {
      id: uid("fa"), instituteId: inst1.id, studentId: s.id, feeStructureId: fs.id,
      discount: 0, totalPayable: fs.totalAmount, totalPaid: 0, status: "PENDING", createdAt: now,
    };
    feeAssignments.set(assn.id, assn);
  });

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
