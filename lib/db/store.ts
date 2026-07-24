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
  id: string;
  instituteId: string;
  name: string;         // e.g. "2025-26"
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
}

export interface ClassRecord {
  id: string;
  instituteId: string;
  name: string;         // "Grade 10"
  code?: string;
  createdAt: string;
}

export interface Batch {
  id: string;
  instituteId: string;
  classId: string;
  academicYearId: string;
  name: string;         // "10-A"
  createdAt: string;
}

export interface Student {
  id: string;
  instituteId: string;
  admissionNo: string;
  name: string;
  guardianName?: string;
  phone?: string;
  email?: string;
  classId: string;
  batchId: string;
  academicYearId: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
}

export interface AuditLog {
  id: string;
  instituteId: string | null;
  actorId: string;
  actorEmail: string;
  action: string;
  entity: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  ip?: string;
  createdAt: string;
}

type Store = {
  institutes: Map<string, Institute>;
  users: Map<string, User>;
  refreshTokens: Map<string, { userId: string; createdAt: number }>;
  academicYears: Map<string, AcademicYear>;
  classes: Map<string, ClassRecord>;
  batches: Map<string, Batch>;
  students: Map<string, Student>;
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

  // Two demo institutes
  const inst1: Institute = {
    id: "inst_greenwood",
    name: "Greenwood Public School",
    code: "GPS",
    address: "12 Park Ave, Bengaluru",
    phone: "+91 80 4000 1000",
    email: "office@greenwood.edu",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
  const inst2: Institute = {
    id: "inst_northstar",
    name: "Northstar Academy",
    code: "NSA",
    address: "9 Ring Road, Pune",
    phone: "+91 20 4000 2000",
    email: "hello@northstar.edu",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
  institutes.set(inst1.id, inst1);
  institutes.set(inst2.id, inst2);

  const pw = hashSync("Password123!", 10);

  const mk = (email: string, name: string, role: Role, instituteId: string | null): User => ({
    id: uid("usr"),
    email,
    name,
    passwordHash: pw,
    role,
    instituteId,
    active: true,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now,
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

  // Academic scaffolding for Greenwood
  const ay: AcademicYear = {
    id: "ay_gw_2526",
    instituteId: inst1.id,
    name: "2025-26",
    startDate: "2025-06-01",
    endDate: "2026-05-31",
    isActive: true,
    createdAt: now,
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

  const names = ["Aarav Sharma", "Isha Patel", "Kabir Singh", "Meera Reddy", "Rohan Iyer", "Sara Kapoor", "Vivaan Mehta", "Zara Khan"];
  names.forEach((n, i) => {
    const s: Student = {
      id: uid("stu"),
      instituteId: inst1.id,
      admissionNo: `GPS-${2500 + i}`,
      name: n,
      guardianName: n.split(" ")[1] ? `Mr. ${n.split(" ")[1]}` : undefined,
      phone: `+9199000${(10000 + i).toString().slice(-5)}`,
      email: `${n.toLowerCase().replace(/\s+/g, ".")}@greenwood.edu`,
      classId: i % 2 === 0 ? "cls_gw_10" : "cls_gw_9",
      batchId: i % 2 === 0 ? "bt_10a" : "bt_9a",
      academicYearId: ay.id,
      status: "ACTIVE",
      createdAt: now,
    };
    students.set(s.id, s);
  });

  return {
    institutes,
    users,
    refreshTokens: new Map(),
    academicYears,
    classes,
    batches,
    students,
    auditLogs: [],
  };
}

export const store: Store = g.__ledgerly_store ?? (g.__ledgerly_store = seed());

export function findUserByEmail(email: string): User | undefined {
  for (const u of store.users.values()) if (u.email.toLowerCase() === email.toLowerCase()) return u;
}

export function scopeByInstitute<T extends { instituteId: string }>(rows: Iterable<T>, instituteId: string | null): T[] {
  const arr = Array.from(rows);
  if (instituteId === null) return arr; // super admin sees all
  return arr.filter((r) => r.instituteId === instituteId);
}

export function pushAudit(entry: Omit<AuditLog, "id" | "createdAt">) {
  store.auditLogs.unshift({ ...entry, id: uid("aud"), createdAt: new Date().toISOString() });
  if (store.auditLogs.length > 500) store.auditLogs.length = 500;
}
