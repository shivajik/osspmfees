import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

export interface PdfTableOptions {
  title: string;
  subtitle?: string;
  columns: { header: string; width: number; align?: "left" | "right" }[];
  rows: (string | number)[][];
  footer?: string;
}

const PAGE_W = 595.28; // A4 in pt
const PAGE_H = 841.89;
const MARGIN = 40;
const LINE_H = 16;

async function fonts(pdf: PDFDocument) {
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  return { regular, bold };
}

function drawText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size = 10, color = rgb(0.1, 0.11, 0.14)) {
  page.drawText(String(text ?? ""), { x, y, size, font, color });
}

export async function renderTablePdf(opts: PdfTableOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const { regular, bold } = await fonts(pdf);
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  drawText(page, opts.title, MARGIN, y, bold, 18);
  y -= 22;
  if (opts.subtitle) {
    drawText(page, opts.subtitle, MARGIN, y, regular, 10, rgb(0.4, 0.42, 0.48));
    y -= 18;
  }
  drawText(page, `Generated ${new Date().toISOString().slice(0, 19).replace("T", " ")}`, MARGIN, y, regular, 8, rgb(0.5, 0.52, 0.58));
  y -= 22;

  const totalW = opts.columns.reduce((s, c) => s + c.width, 0);
  const scale = (PAGE_W - MARGIN * 2) / totalW;
  const widths = opts.columns.map((c) => c.width * scale);

  const drawHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - 4, width: PAGE_W - MARGIN * 2, height: LINE_H + 2, color: rgb(0.95, 0.96, 0.98) });
    let x = MARGIN + 6;
    opts.columns.forEach((c, i) => {
      const tx = c.align === "right" ? x + widths[i] - 12 - bold.widthOfTextAtSize(c.header, 9) : x;
      drawText(page, c.header, tx, y, bold, 9, rgb(0.35, 0.38, 0.45));
      x += widths[i];
    });
    y -= LINE_H + 4;
  };
  drawHeader();

  for (const row of opts.rows) {
    if (y < MARGIN + 40) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      drawHeader();
    }
    let x = MARGIN + 6;
    row.forEach((cell, i) => {
      const text = String(cell ?? "");
      const col = opts.columns[i];
      const w = regular.widthOfTextAtSize(text, 9);
      const tx = col.align === "right" ? x + widths[i] - 12 - w : x;
      drawText(page, text, tx, y, regular, 9);
      x += widths[i];
    });
    y -= LINE_H;
    page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: PAGE_W - MARGIN, y: y + 4 }, thickness: 0.3, color: rgb(0.9, 0.91, 0.93) });
  }

  if (opts.footer) {
    drawText(page, opts.footer, MARGIN, MARGIN - 10, regular, 8, rgb(0.5, 0.52, 0.58));
  }

  return pdf.save();
}

export interface ReceiptData {
  institute: { name: string; address?: string; phone?: string; email?: string };
  receiptNo: string;
  paidAt: string;
  student: { name: string; admissionNo: string; guardianName?: string; className?: string; batchName?: string };
  payment: { amount: number; mode: string; accountName?: string; reference?: string; cashier?: string };
  structureName?: string;
  totals?: { payable: number; paid: number; balance: number };
  currency: string;
}

function money(v: number, currency: string) {
  return `${currency}${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function renderReceiptPdf(r: ReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const { regular, bold } = await fonts(pdf);
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const grey = rgb(0.45, 0.48, 0.54);
  const dark = rgb(0.1, 0.11, 0.14);
  let y = PAGE_H - MARGIN;

  drawText(page, r.institute.name, MARGIN, y, bold, 16, dark);
  drawText(page, "FEE RECEIPT", PAGE_W - MARGIN - bold.widthOfTextAtSize("FEE RECEIPT", 10), y, bold, 10, grey);
  y -= 16;
  if (r.institute.address) { drawText(page, r.institute.address, MARGIN, y, regular, 9, grey); }
  drawText(page, `No: ${r.receiptNo}`, PAGE_W - MARGIN - bold.widthOfTextAtSize(`No: ${r.receiptNo}`, 12), y, bold, 12, dark);
  y -= 12;
  const contact = [r.institute.phone, r.institute.email].filter(Boolean).join("  ·  ");
  if (contact) { drawText(page, contact, MARGIN, y, regular, 9, grey); }
  drawText(page, r.paidAt.slice(0, 10), PAGE_W - MARGIN - regular.widthOfTextAtSize(r.paidAt.slice(0, 10), 9), y, regular, 9, grey);
  y -= 20;

  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: rgb(0.85, 0.87, 0.9) });
  y -= 18;

  const colW = (PAGE_W - MARGIN * 2) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW;
  drawText(page, "RECEIVED FROM", leftX, y, bold, 8, grey);
  drawText(page, "PAYMENT", rightX, y, bold, 8, grey);
  y -= 14;
  drawText(page, r.student.name, leftX, y, bold, 11, dark);
  drawText(page, `Mode: ${r.payment.mode}`, rightX, y, regular, 10, dark);
  y -= 14;
  drawText(page, `Admission #: ${r.student.admissionNo}`, leftX, y, regular, 9, grey);
  if (r.payment.accountName) drawText(page, `Account: ${r.payment.accountName}`, rightX, y, regular, 9, grey);
  y -= 12;
  const cls = [r.student.className, r.student.batchName].filter(Boolean).join(" · ");
  if (cls) drawText(page, `Class: ${cls}`, leftX, y, regular, 9, grey);
  if (r.payment.reference) drawText(page, `Ref: ${r.payment.reference}`, rightX, y, regular, 9, grey);
  y -= 12;
  if (r.student.guardianName) drawText(page, `Guardian: ${r.student.guardianName}`, leftX, y, regular, 9, grey);
  if (r.payment.cashier) drawText(page, `Cashier: ${r.payment.cashier}`, rightX, y, regular, 9, grey);
  y -= 22;

  page.drawRectangle({ x: MARGIN, y: y - 4, width: PAGE_W - MARGIN * 2, height: 20, color: rgb(0.95, 0.96, 0.98) });
  drawText(page, "DESCRIPTION", MARGIN + 8, y + 2, bold, 8, grey);
  drawText(page, "AMOUNT", PAGE_W - MARGIN - 8 - bold.widthOfTextAtSize("AMOUNT", 8), y + 2, bold, 8, grey);
  y -= 22;

  drawText(page, r.structureName ?? "Fee payment", MARGIN + 8, y, regular, 10, dark);
  const amt = money(r.payment.amount, r.currency);
  drawText(page, amt, PAGE_W - MARGIN - 8 - bold.widthOfTextAtSize(amt, 11), y, bold, 11, dark);
  y -= 20;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: rgb(0.85, 0.87, 0.9) });
  y -= 16;
  drawText(page, "TOTAL RECEIVED", MARGIN + 8, y, bold, 10, grey);
  const totalStr = money(r.payment.amount, r.currency);
  drawText(page, totalStr, PAGE_W - MARGIN - 8 - bold.widthOfTextAtSize(totalStr, 14), y, bold, 14, dark);
  y -= 30;

  if (r.totals) {
    drawText(page, `Payable: ${money(r.totals.payable, r.currency)}`, MARGIN, y, regular, 9, grey);
    drawText(page, `Paid to date: ${money(r.totals.paid, r.currency)}`, MARGIN + 180, y, regular, 9, grey);
    drawText(page, `Balance: ${money(r.totals.balance, r.currency)}`, MARGIN + 360, y, regular, 9, grey);
    y -= 24;
  }

  drawText(page, "Thank you for your payment. This is a system-generated receipt.", MARGIN, MARGIN + 24, regular, 8, grey);
  drawText(page, "Authorized signatory", PAGE_W - MARGIN - 100, MARGIN + 24, regular, 8, grey);
  page.drawLine({ start: { x: PAGE_W - MARGIN - 120, y: MARGIN + 38 }, end: { x: PAGE_W - MARGIN, y: MARGIN + 38 }, thickness: 0.5, color: grey, dashArray: [2, 2] });

  return pdf.save();
}
