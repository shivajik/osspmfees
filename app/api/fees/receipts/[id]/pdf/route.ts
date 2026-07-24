import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission, permissionsForRole } from "@/lib/auth/rbac";
import { store } from "@/lib/db/store";
import { renderReceiptPdf } from "@/lib/export/pdf";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!hasPermission(permissionsForRole(user.role), PERMISSIONS.FEE_READ)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const p = store.feePayments.get(id);
  if (!p) return new NextResponse("Not found", { status: 404 });
  if (user.instituteId && p.instituteId !== user.instituteId) {
    return new NextResponse("Not found", { status: 404 });
  }

  const student = store.students.get(p.studentId);
  const assn = store.feeAssignments.get(p.assignmentId);
  const structure = assn ? store.feeStructures.get(assn.feeStructureId) : undefined;
  const cls = student ? store.classes.get(student.classId) : undefined;
  const batch = student ? store.batches.get(student.batchId) : undefined;
  const institute = store.institutes.get(p.instituteId);
  const account = p.accountId ? store.accounts.get(p.accountId) : undefined;

  const bytes = await renderReceiptPdf({
    institute: {
      name: institute?.name ?? "Institute",
      address: institute?.address,
      phone: institute?.phone,
      email: institute?.email,
    },
    receiptNo: p.receiptNo,
    paidAt: p.paidAt,
    student: {
      name: student?.name ?? "—",
      admissionNo: student?.admissionNo ?? "—",
      guardianName: student?.guardianName,
      className: cls?.name,
      batchName: batch?.name,
    },
    payment: {
      amount: p.amount,
      mode: p.mode,
      accountName: account?.name,
      reference: p.reference,
      cashier: p.createdByName,
    },
    structureName: structure?.name,
    totals: assn ? {
      payable: assn.totalPayable,
      paid: assn.totalPaid,
      balance: assn.totalPayable - assn.totalPaid,
    } : undefined,
    currency: "\u20B9 ",
  });

  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="receipt-${p.receiptNo}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
