import * as XLSX from "xlsx";

export function renderXlsx(sheetName: string, rows: (string | number)[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Size each column to its longest value so names and dates aren't cut off.
  const cols = Math.max(0, ...rows.map((r) => r.length));
  ws["!cols"] = Array.from({ length: cols }, (_, i) => ({
    wch: Math.min(60, Math.max(8, ...rows.map((r) => String(r[i] ?? "").length)) + 2),
  }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || "Sheet1");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Uint8Array(buf);
}
