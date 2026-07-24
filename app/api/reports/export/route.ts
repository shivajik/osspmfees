import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { scopeByInstitute, store } from "@/lib/db/store";

function csv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!hasPermission(permissionsForRole(user.role), PERMISSIONS.REPORT_VIEW)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const scope = user.instituteId;
  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") ?? "daily";

  let rows: (string | number)[][] = [];
  if (tab === "daily" || tab === "monthly") {
    const key = tab === "daily" ? 10 : 7;
    const map = new Map<string, { count: number; total: number }>();
    scopeByInstitute(store.feePayments.values(), scope).forEach((p) => {
      const k = p.paidAt.slice(0, key);
      const cur = map.get(k) ?? { count: 0, total: 0 };
      cur.count += 1; cur.total += p.amount;
      map.set(k, cur);
    });
    rows = [["Period", "Receipts", "Amount"], ...Array.from(map.entries()).sort().map(([k, v]) => [k, v.count, v.total])];
  } else if (tab === "student") {
    const map = new Map<string, { payable: number; paid: number }>();
    scopeByInstitute(store.feeAssignments.values(), scope).forEach((a) => {
      const cur = map.get(a.studentId) ?? { payable: 0, paid: 0 };
      cur.payable += a.totalPayable; cur.paid += a.totalPaid;
      map.set(a.studentId, cur);
    });
    rows = [["Admission", "Student", "Payable", "Paid", "Balance"]];
    map.forEach((v, sid) => {
      const s = store.students.get(sid);
      rows.push([s?.admissionNo ?? "", s?.name ?? "", v.payable, v.paid, v.payable - v.paid]);
    });
  } else if (tab === "pending") {
    rows = [["Admission", "Student", "Class", "Balance", "Status"]];
    scopeByInstitute(store.feeAssignments.values(), scope).filter((a) => a.status !== "PAID").forEach((a) => {
      const s = store.students.get(a.studentId);
      const cls = s ? store.classes.get(s.classId)?.name ?? "" : "";
      rows.push([s?.admissionNo ?? "", s?.name ?? "", cls, a.totalPayable - a.totalPaid, a.status]);
    });
  } else if (tab === "expense") {
    const map = new Map<string, { count: number; total: number }>();
    scopeByInstitute(store.expenses.values(), scope).forEach((e) => {
      const cur = map.get(e.categoryId) ?? { count: 0, total: 0 };
      cur.count += 1; cur.total += e.amount;
      map.set(e.categoryId, cur);
    });
    rows = [["Category", "Vouchers", "Amount"]];
    map.forEach((v, cid) => rows.push([store.expenseCategories.get(cid)?.name ?? "", v.count, v.total]));
  } else if (tab === "cashbook" || tab === "bank") {
    const type = tab === "cashbook" ? "CASH" : "BANK";
    const accIds = new Set(scopeByInstitute(store.accounts.values(), scope).filter((a) => a.type === type).map((a) => a.id));
    rows = [["Date", "Account", "Reference", "Direction", "Amount", "Balance"]];
    scopeByInstitute(store.transactions.values(), scope)
      .filter((t) => accIds.has(t.accountId))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .forEach((t) => rows.push([
        t.occurredAt.slice(0, 10),
        store.accounts.get(t.accountId)?.name ?? "",
        t.reference ?? "",
        t.direction,
        t.amount,
        t.balanceAfter,
      ]));
  }

  const body = csv(rows);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="ledgerly-${tab}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
