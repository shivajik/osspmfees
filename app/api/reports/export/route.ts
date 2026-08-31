import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { scopeByInstitute, store } from "@/lib/db/store";
import { renderTablePdf } from "@/lib/export/pdf";
import { renderXlsx } from "@/lib/export/xlsx";

export const runtime = "nodejs";

type Format = "csv" | "xlsx" | "pdf";

const TAB_TITLES: Record<string, string> = {
  daily: "Daily collection",
  monthly: "Monthly collection",
  student: "Student collection",
  pending: "Pending fees",
  expense: "Expense summary",
  cashbook: "Cash book",
  bank: "Bank ledger",
};

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
  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") ?? "daily";
  const format = ((url.searchParams.get("format") ?? "csv").toLowerCase() as Format);

  // Mirrors the Reports screen: institute users stay on their tenant, a super
  // admin may narrow to one institute via ?instituteId.
  const requested = url.searchParams.get("instituteId") ?? "";
  const chosen = !user.instituteId && store.institutes.has(requested) ? requested : null;
  const scope = user.instituteId ?? chosen;
  const showInstitute = !scope;
  const instituteName = (id: string) => store.institutes.get(id)?.name ?? "";
  const collectedBy = (p: { createdBy: string; createdByName: string }) => {
    const u = store.users.get(p.createdBy);
    const name = p.createdByName || u?.name || "";
    return u?.role ? `${name} (${u.role.replace("_", " ")})` : name;
  };

  let rows: (string | number)[][] = [];
  if (tab === "daily" || tab === "monthly") {
    const key = tab === "daily" ? 10 : 7;
    const map = new Map<string, { period: string; instituteId: string; count: number; total: number; by: Set<string> }>();
    scopeByInstitute(store.feePayments.values(), scope).forEach((p) => {
      const period = p.paidAt.slice(0, key);
      const k = showInstitute ? `${period}|${p.instituteId}` : period;
      const cur = map.get(k) ?? { period, instituteId: p.instituteId, count: 0, total: 0, by: new Set<string>() };
      cur.count += 1; cur.total += p.amount; cur.by.add(collectedBy(p));
      map.set(k, cur);
    });
    rows = [[
      "Period",
      ...(showInstitute ? ["Institute"] : []),
      "Receipts", "Collected by", "Amount",
    ]];
    Array.from(map.values())
      .sort((a, b) => b.period.localeCompare(a.period))
      .forEach((v) => rows.push([
        v.period,
        ...(showInstitute ? [instituteName(v.instituteId)] : []),
        v.count,
        Array.from(v.by).filter(Boolean).join(", "),
        v.total,
      ]));
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

  const today = new Date().toISOString().slice(0, 10);
  const baseName = `ledgerly-${tab}-${today}`;
  const title = TAB_TITLES[tab] ?? "Report";

  if (format === "xlsx") {
    const bytes = renderXlsx(title, rows);
    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${baseName}.xlsx"`,
      },
    });
  }

  if (format === "pdf") {
    const header = rows[0] ?? [];
    const body = rows.slice(1);
    const columns = header.map((h, i) => {
      const sample = body.find((r) => r[i] !== undefined);
      const isNumeric = typeof sample?.[i] === "number";
      return { header: String(h), width: isNumeric ? 90 : 120, align: (isNumeric ? "right" : "left") as "left" | "right" };
    });
    const institute = scope ? store.institutes.get(scope)?.name : "All institutes";
    const bytes = await renderTablePdf({
      title,
      subtitle: institute,
      columns: columns.length ? columns : [{ header: "—", width: 200 }],
      rows: body,
      footer: `Ledgerly · ${today}`,
    });
    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${baseName}.pdf"`,
      },
    });
  }

  const body = csv(rows);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${baseName}.csv"`,
    },
  });
}
