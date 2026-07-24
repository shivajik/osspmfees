export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  INSTITUTE_ADMIN: "INSTITUTE_ADMIN",
  ACCOUNTANT: "ACCOUNTANT",
  CASHIER: "CASHIER",
  VIEWER: "VIEWER",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const PERMISSIONS = {
  // Super admin only
  INSTITUTE_MANAGE: "institute:manage",
  USER_MANAGE: "user:manage",
  ROLE_MANAGE: "role:manage",
  AUDIT_VIEW: "audit:view",
  SETTINGS_MANAGE: "settings:manage",
  // Institute scope
  STUDENT_READ: "student:read",
  STUDENT_WRITE: "student:write",
  CLASS_READ: "class:read",
  CLASS_WRITE: "class:write",
  BATCH_READ: "batch:read",
  BATCH_WRITE: "batch:write",
  ACADEMIC_YEAR_WRITE: "academic_year:write",
  FEE_STRUCTURE_WRITE: "fee_structure:write",
  FEE_COLLECT: "fee:collect",
  FEE_READ: "fee:read",
  EXPENSE_WRITE: "expense:write",
  EXPENSE_READ: "expense:read",
  BANK_WRITE: "bank:write",
  BANK_READ: "bank:read",
  REPORT_VIEW: "report:view",
  RECEIPT_GENERATE: "receipt:generate",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: Object.values(P),
  INSTITUTE_ADMIN: [
    P.STUDENT_READ, P.STUDENT_WRITE, P.CLASS_READ, P.CLASS_WRITE,
    P.BATCH_READ, P.BATCH_WRITE, P.ACADEMIC_YEAR_WRITE,
    P.FEE_STRUCTURE_WRITE, P.FEE_COLLECT, P.FEE_READ,
    P.EXPENSE_WRITE, P.EXPENSE_READ, P.BANK_WRITE, P.BANK_READ,
    P.REPORT_VIEW, P.RECEIPT_GENERATE, P.USER_MANAGE, P.AUDIT_VIEW,
  ],
  ACCOUNTANT: [
    P.STUDENT_READ, P.CLASS_READ, P.BATCH_READ,
    P.FEE_READ, P.FEE_COLLECT, P.EXPENSE_READ, P.EXPENSE_WRITE,
    P.BANK_READ, P.BANK_WRITE, P.REPORT_VIEW, P.RECEIPT_GENERATE,
  ],
  CASHIER: [
    P.STUDENT_READ, P.FEE_READ, P.FEE_COLLECT, P.RECEIPT_GENERATE,
  ],
  VIEWER: [
    P.STUDENT_READ, P.CLASS_READ, P.BATCH_READ, P.FEE_READ,
    P.EXPENSE_READ, P.BANK_READ, P.REPORT_VIEW,
  ],
};

export function permissionsForRole(role: string): Permission[] {
  return ROLE_PERMISSIONS[role as Role] ?? [];
}

export function hasPermission(userPerms: string[] | undefined, needed: Permission | Permission[]): boolean {
  if (!userPerms) return false;
  const list = Array.isArray(needed) ? needed : [needed];
  return list.every((p) => userPerms.includes(p));
}

export function isSuperAdmin(role: string | undefined): boolean {
  return role === ROLES.SUPER_ADMIN;
}
