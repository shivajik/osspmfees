import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

export interface PdfTableOptions {
  title: string;
  subtitle?: string;
  columns: { header: string; width: number; align?: "left" | "right" }[];
  rows: (string | number)[][];
  footer?: string;
}

const A4_W = 595.28; // A4 in pt
const A4_H = 841.89;
const PAGE_W = A4_W;
const PAGE_H = A4_H;
const MARGIN = 40;
const LINE_H = 16;

async function fonts(pdf: PDFDocument) {
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  return { regular, bold };
}

/**
 * The standard PDF fonts only cover WinAnsi (Latin-1). Anything outside it —
 * the ₹ sign, dashes, Devanagari names — throws and fails the whole PDF, so map
 * what we can and replace the rest.
 */
export function pdfSafe(text: string): string {
  return text
    .replace(/₹\s?/g, "Rs. ")
    .replace(/[–—−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x00-\xFF]/g, "?");
}

/** Shortens text with "..." so it fits within maxW at the given size. */
export function fitText(text: string, font: PDFFont, size: number, maxW: number): string {
  let t = pdfSafe(text);
  if (font.widthOfTextAtSize(t, size) <= maxW) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > maxW) t = t.slice(0, -1);
  return `${t}...`;
}

/** Splits text into lines that fit maxW; the last allowed line is shortened with "...". */
export function wrapText(text: string, font: PDFFont, size: number, maxW: number, maxLines: number): string[] {
  const words = pdfSafe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= maxW || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = fitText(`${kept[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`, font, size, maxW);
    return kept;
  }
  return lines.map((l) => fitText(l, font, size, maxW));
}

function drawText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size = 10, color = rgb(0.1, 0.11, 0.14)) {
  page.drawText(pdfSafe(String(text ?? "")), { x, y, size, font, color });
}

export async function renderTablePdf(opts: PdfTableOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const { regular, bold } = await fonts(pdf);
  // Wide tables (many fee-head columns) go landscape.
  const natural = opts.columns.reduce((s, c) => s + c.width, 0);
  const landscape = natural > A4_W - MARGIN * 2 + 40;
  const PAGE_W = landscape ? A4_H : A4_W;
  const PAGE_H = landscape ? A4_W : A4_H;
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

  const scale = (PAGE_W - MARGIN * 2) / natural;
  const widths = opts.columns.map((c) => c.width * scale);

  // Headers wrap onto up to 3 lines so fee-head names stay readable.
  const HEAD_SIZE = 8;
  const HEAD_LINE = 10;
  const headerLines = opts.columns.map((c, i) => wrapText(String(c.header), bold, HEAD_SIZE, widths[i] - 8, 3));
  const headerRows = Math.max(1, ...headerLines.map((l) => l.length));
  const drawHeader = () => {
    const h = headerRows * HEAD_LINE + 6;
    page.drawRectangle({ x: MARGIN, y: y - h + HEAD_LINE + 2, width: PAGE_W - MARGIN * 2, height: h, color: rgb(0.95, 0.96, 0.98) });
    let x = MARGIN + 6;
    opts.columns.forEach((c, i) => {
      headerLines[i].forEach((line, li) => {
        const tx = c.align === "right" ? x + widths[i] - 12 - bold.widthOfTextAtSize(line, HEAD_SIZE) : x;
        drawText(page, line, tx, y - li * HEAD_LINE, bold, HEAD_SIZE, rgb(0.35, 0.38, 0.45));
      });
      x += widths[i];
    });
    y -= h + 2;
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
      const col = opts.columns[i];
      if (!col) return;
      const isTotal = String(row.find((c) => c !== "") ?? "") === "TOTAL";
      const text = fitText(String(cell ?? ""), isTotal ? bold : regular, 9, widths[i] - 8);
      const w = (isTotal ? bold : regular).widthOfTextAtSize(text, 9);
      const tx = col.align === "right" ? x + widths[i] - 12 - w : x;
      drawText(page, text, tx, y, isTotal ? bold : regular, 9);
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
  /** Per-head allocation of what this receipt settled. */
  breakup?: { head: string; amount: number }[];
  discount?: number;
  /** Present when the receipt was reversed — printed as a banner so it can't pass as valid. */
  reversed?: { at: string; by: string; reason: string };
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
  drawText(page, "FEE RECEIPT", PAGE_W - MARGIN - bold.widthOfTextAtSize(pdfSafe(String("FEE RECEIPT")), 10), y, bold, 10, grey);
  y -= 16;
  if (r.institute.address) { drawText(page, r.institute.address, MARGIN, y, regular, 9, grey); }
  drawText(page, `No: ${r.receiptNo}`, PAGE_W - MARGIN - bold.widthOfTextAtSize(pdfSafe(String(`No: ${r.receiptNo}`)), 12), y, bold, 12, dark);
  y -= 12;
  const contact = [r.institute.phone, r.institute.email].filter(Boolean).join("  ·  ");
  if (contact) { drawText(page, contact, MARGIN, y, regular, 9, grey); }
  drawText(page, r.paidAt.slice(0, 10), PAGE_W - MARGIN - regular.widthOfTextAtSize(pdfSafe(r.paidAt.slice(0, 10)), 9), y, regular, 9, grey);
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
  drawText(page, "AMOUNT", PAGE_W - MARGIN - 8 - bold.widthOfTextAtSize(pdfSafe(String("AMOUNT")), 8), y + 2, bold, 8, grey);
  y -= 22;

  const lines = r.breakup?.length ? r.breakup : [{ head: r.structureName ?? "Fee payment", amount: r.payment.amount }];
  for (const line of lines) {
    drawText(page, line.head, MARGIN + 8, y, regular, 10, dark);
    const amt = money(line.amount, r.currency);
    drawText(page, amt, PAGE_W - MARGIN - 8 - regular.widthOfTextAtSize(pdfSafe(String(amt)), 10), y, regular, 10, dark);
    y -= 16;
  }
  if (r.discount && r.discount > 0) {
    drawText(page, "Less: discount / concession", MARGIN + 8, y, regular, 10, grey);
    const d = `- ${money(r.discount, r.currency)}`;
    drawText(page, d, PAGE_W - MARGIN - 8 - regular.widthOfTextAtSize(pdfSafe(String(d)), 10), y, regular, 10, grey);
    y -= 16;
  }
  y -= 4;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: rgb(0.85, 0.87, 0.9) });
  y -= 16;
  drawText(page, "TOTAL RECEIVED", MARGIN + 8, y, bold, 10, grey);
  const totalStr = money(r.payment.amount, r.currency);
  drawText(page, totalStr, PAGE_W - MARGIN - 8 - bold.widthOfTextAtSize(pdfSafe(String(totalStr)), 14), y, bold, 14, dark);
  y -= 30;

  if (r.totals) {
    drawText(page, `Payable: ${money(r.totals.payable, r.currency)}`, MARGIN, y, regular, 9, grey);
    drawText(page, `Paid to date: ${money(r.totals.paid, r.currency)}`, MARGIN + 180, y, regular, 9, grey);
    drawText(page, `Balance: ${money(r.totals.balance, r.currency)}`, MARGIN + 360, y, regular, 9, grey);
    y -= 24;
  }

  if (r.reversed) {
    const red = rgb(0.8, 0.1, 0.1);
    page.drawRectangle({ x: MARGIN, y: y - 30, width: PAGE_W - MARGIN * 2, height: 40, borderColor: red, borderWidth: 1.5 });
    drawText(page, "REVERSED - NOT VALID AS PROOF OF PAYMENT", MARGIN + 10, y - 6, bold, 11, red);
    drawText(page, `On ${r.reversed.at.slice(0, 10)} by ${r.reversed.by}: ${r.reversed.reason}`.slice(0, 110), MARGIN + 10, y - 22, regular, 9, red);
    y -= 48;
  }

  drawText(page, "Thank you for your payment. This is a system-generated receipt.", MARGIN, MARGIN + 24, regular, 8, grey);
  drawText(page, "Authorized signatory", PAGE_W - MARGIN - 100, MARGIN + 24, regular, 8, grey);
  page.drawLine({ start: { x: PAGE_W - MARGIN - 120, y: MARGIN + 38 }, end: { x: PAGE_W - MARGIN, y: MARGIN + 38 }, thickness: 0.5, color: grey, dashArray: [2, 2] });

  return pdf.save();
}
