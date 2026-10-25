import { test } from "node:test";
import assert from "node:assert/strict";
import { pdfSafe, renderReceiptPdf, renderTablePdf } from "@/lib/export/pdf";

const receipt = {
  institute: { name: "Om Secondary School", address: "Sahakar Nagar — Chh. Sambhajinagar" },
  receiptNo: "RCP-1001", paidAt: "2026-10-25T12:00:00.000Z",
  student: { name: "रमेश पाटील", admissionNo: "101", guardianName: "madan lal" },
  payment: { amount: 1900, mode: "CASH", cashier: "Om Secondary School — Admin" },
  structureName: "Grade 10 Fees 2025-26",
  totals: { payable: 6600, paid: 1900, balance: 4700 },
  breakup: [{ head: "Previous year balance", amount: 600 }, { head: "Admission fee", amount: 1300 }],
  discount: 100,
  reversed: { at: "2026-10-25T13:00:00.000Z", by: "Admin", reason: "Cheque bounced — returned" },
  currency: "₹ ",
};

test("pdfSafe maps rupee sign and dashes, replaces unsupported characters", () => {
  assert.equal(pdfSafe("₹ 1,000 — paid"), "Rs. 1,000 - paid");
  assert.equal(pdfSafe("रमेश"), "????");
});

test("receipt PDF renders with ₹, dashes, Devanagari, breakup and reversal", async () => {
  const bytes = await renderReceiptPdf(receipt);
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
});

test("report table PDF renders with ₹ values", async () => {
  const bytes = await renderTablePdf({ title: "Pending — fees", columns: [{ header: "Student", width: 300 }, { header: "Balance", width: 215, align: "right" }], rows: [["Sita — 10-A", "₹6,000"]] });
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
});
