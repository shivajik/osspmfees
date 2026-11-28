import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { assignmentYearId, scopeByInstitute, store, isActivePayment } from "@/lib/db/store";
import { renderTablePdf } from "@/lib/export/pdf";
import { renderXlsx } from "@/lib/export/xlsx";
import { classRows, filterAssignments, headRows, studentHeadRows } from "@/lib/reports/fee-heads";
import { receiptRows, todayIST } from "@/lib/reports/receipts";

export const runtime = "nodejs";

type Format = "csv" | "xlsx" | "pdf";

const TAB_TITLES: Record<string, string> = {
  daily: "Daily collection",
  receipts: "Daily collection - receipt-wise",
  monthly: "Monthly collection",
  classwise: "Class-wise fees",
  student: "Student-wise fees",
  headwise: "Fee head-wise",
  pending: "Pending fees",
  discount: "Discounts given",
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

  const feeAssignments = () => filterAssignments(scopeByInstitute(store.feeAssignments.values(), scope), {
    classId: url.searchParams.get("classId") ?? "",
    yearId: url.searchParams.get("yearId") ?? "",
  });
  const inst = (id: string) => (showInstitute ? [instituteName(id)] : []);
  const instHead = showInstitute ? ["Institute"] : [];
  const total = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

  let rows: (string | number)[][] = [];
  if (tab === "receipts") {
    const isDate = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const from = isDate(url.searchParams.get("from")) ? url.searchParams.get("from")! : todayIST();
    const to = isDate(url.searchParams.get("to")) ? url.searchParams.get("to")! : from;
    const list = receiptRows(scope, from, to, url.searchParams.get("classId") ?? "");
    rows = [["Date", ...instHead, "Receipt #", "Student", "Admission", "Class", "Fee heads", "Mode", "Discount", "Amount", "Collected by"]];
    list.forEach((r) => rows.push([
      r.date, ...inst(r.instituteId), r.receiptNo, r.student, r.adm, r.className, r.heads, r.mode, r.discount, r.amount, r.collectedBy,
    ]));
    rows.push(["", ...(showInstitute ? [""] : []), "", "TOTAL", "", "", "", "", total(list, (r) => r.discount), total(list, (r) => r.amount), ""]);
  } else if (tab === "daily" || tab === "monthly") {
    const key = tab === "daily" ? 10 : 7;
    const map = new Map<string, { period: string; instituteId: string; count: number; total: number; by: Set<string> }>();
    scopeByInstitute(store.feePayments.values(), scope).filter(isActivePayment).forEach((p) => {
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
  } else if (tab === "classwise") {
    const { heads, rows: students } = studentHeadRows(feeAssignments());
    const cls = classRows(students, showInstitute);
    const pendHeads = heads.filter((h) => cls.some((c) => c.pendingByHead[h]));
    rows = [[...instHead, "Class", "Students", "With dues", "Payable", "Received", "Balance", ...pendHeads.map((h) => `${h} (due)`)]];
    cls.forEach((c) => rows.push([
      ...inst(c.instituteId), c.className, c.students, c.pendingStudents, c.payable, c.received, c.balance,
      ...pendHeads.map((h) => c.pendingByHead[h] ?? 0),
    ]));
    rows.push([
      ...(showInstitute ? [""] : []), "TOTAL", total(cls, (c) => c.students), total(cls, (c) => c.pendingStudents),
      total(cls, (c) => c.payable), total(cls, (c) => c.received), total(cls, (c) => c.balance),
      ...pendHeads.map((h) => total(cls, (c) => c.pendingByHead[h] ?? 0)),
    ]);
  } else if (tab === "student") {
    const { heads, rows: students } = studentHeadRows(feeAssignments());
    const recHeads = heads.filter((h) => students.some((r) => r.receivedByHead[h]));
    rows = [["Sr", ...instHead, "Class", "Admission", "Student", "Payable", ...recHeads, "Received", "Balance"]];
    students.forEach((r, i) => rows.push([
      i + 1, ...inst(r.instituteId), r.className, r.adm, r.name, r.payable,
      ...recHeads.map((h) => r.receivedByHead[h] ?? 0), r.received, r.balance,
    ]));
    rows.push([
      "", ...(showInstitute ? [""] : []), "", "", "TOTAL", total(students, (r) => r.payable),
      ...recHeads.map((h) => total(students, (r) => r.receivedByHead[h] ?? 0)),
      total(students, (r) => r.received), total(students, (r) => r.balance),
    ]);
  } else if (tab === "headwise") {
    const { heads, rows: students } = studentHeadRows(feeAssignments());
    const hr = headRows(heads, students);
    rows = [["Fee head", "Charged", "Received", "Pending", "Students pending"]];
    hr.forEach((h) => rows.push([h.head, h.charged, h.received, h.pending, h.students]));
    rows.push(["TOTAL", total(hr, (h) => h.charged), total(hr, (h) => h.received), total(hr, (h) => h.pending), ""]);
  } else if (tab === "pending") {
    const students = studentHeadRows(feeAssignments()).rows.filter((r) => r.balance > 0);
    rows = [[...instHead, "Class", "Admission", "Student", "Payable", "Received", "Balance", "Pending heads"]];
    students.forEach((r) => rows.push([
      ...inst(r.instituteId), r.className, r.adm, r.name, r.payable, r.received, r.balance,
      Object.entries(r.pendingByHead).filter(([, v]) => v > 0).map(([h, v]) => `${h}: ${v}`).join("; "),
    ]));
    rows.push([...(showInstitute ? [""] : []), "", "", "TOTAL", total(students, (r) => r.payable), total(students, (r) => r.received), total(students, (r) => r.balance), ""]);
  } else if (tab === "discount") {
    const counter = new Map<string, { amount: number; by: Set<string>; reasons: Set<string> }>();
    scopeByInstitute(store.feePayments.values(), scope).filter(isActivePayment).forEach((p) => {
      if (!p.discount) return;
      const cur = counter.get(p.assignmentId) ?? { amount: 0, by: new Set<string>(), reasons: new Set<string>() };
      cur.amount += p.discount;
      if (p.discountByName) cur.by.add(p.discountByName);
      if (p.discountReason) cur.reasons.add(p.discountReason);
      counter.set(p.assignmentId, cur);
    });
    rows = [[
      ...(showInstitute ? ["Institute"] : []),
      "Admission", "Student", "Class", "Academic year",
      "On assignment", "At counter", "Total discount", "Approved by", "Reason",
    ]];
    feeAssignments()
      .map((a) => {
        const c = counter.get(a.id);
        return { a, counter: c?.amount ?? 0, by: c?.by ?? new Set<string>(), reasons: c?.reasons ?? new Set<string>() };
      })
      .filter((r) => r.a.discount + r.counter > 0)
      .sort((x, y) => (y.a.discount + y.counter) - (x.a.discount + x.counter))
      .forEach(({ a, counter: counterAmount, by, reasons }) => {
        const student = store.students.get(a.studentId);
        const cls = student ? store.classes.get(student.classId)?.name ?? "" : "";
        const year = store.academicYears.get(assignmentYearId(a))?.name ?? "";
        const approvers = new Set<string>(by);
        if (a.discount > 0 && a.discountByName) approvers.add(a.discountByName);
        const allReasons = new Set<string>(reasons);
        if (a.discount > 0 && a.discountReason) allReasons.add(a.discountReason);
        rows.push([
          ...(showInstitute ? [instituteName(a.instituteId)] : []),
          student?.admissionNo ?? "",
          student?.name ?? "",
          cls,
          year,
          a.discount,
          counterAmount,
          a.discount + counterAmount,
          Array.from(approvers).join(", "),
          Array.from(allReasons).join(" · "),
        ]);
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
      // Size each column to its longest value so long text (e.g. "Collected by")
      // doesn't run into the next column.
      // Headers wrap, so size by the longest header *word* plus the data.
      const headerWord = Math.max(...String(h).split(/\s+/).map((w) => w.length));
      const longest = Math.max(headerWord, ...body.map((r) => String(r[i] ?? "").length));
      const width = isNumeric ? Math.max(50, Math.min(longest, 12) * 6 + 16) : Math.max(60, Math.min(longest, 60) * 5.2 + 16);
      return { header: String(h), width, align: (isNumeric ? "right" : "left") as "left" | "right" };
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
