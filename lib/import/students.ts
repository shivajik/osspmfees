import * as XLSX from "xlsx";

export interface ParsedStudentRow {
  sheet: string;
  rowNo: number;
  admissionNo: string;
  name: string;
  className: string;
  section: string;
  phone?: string;
  guardianName?: string;
  email?: string;
  previousBalance: number;
  assignedFee: number;
  discount: number;
  warnings: string[];
}

export interface ParseResult {
  rows: ParsedStudentRow[];
  errors: string[];
  detectedColumns: string[];
}

const norm = (v: unknown) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .replace(/[._:;#]/g, "")
    .trim()
    .toLowerCase();

type Key =
  | "admissionNo" | "name" | "className" | "section" | "phone" | "guardianName" | "email"
  | "previousBalance" | "assignedFee" | "discount" | "serial" | "totalBalance";

/** Ordered: the first matching rule wins for a given cell. */
const RULES: Array<{ key: Key; test: (h: string) => boolean; priority: number }> = [
  { key: "name", priority: 10, test: (h) => /(student\s*name|name of (?:the )?student|^name$|^student$|studentname)/.test(h) },
  { key: "admissionNo", priority: 9, test: (h) => /(^prn|prn no|general no|^gr$|^grn$|^gn$|^gr no|admission|adm no|^jr ?no)/.test(h) },
  { key: "className", priority: 8, test: (h) => /(^class$|^std$|standard|^class name)/.test(h) },
  { key: "section", priority: 8, test: (h) => /(^div$|division|^section$|^batch$)/.test(h) },
  { key: "phone", priority: 8, test: (h) => /(mob|mobail|mobile|phone|contact)/.test(h) },
  { key: "guardianName", priority: 7, test: (h) => /(parent|father|guardian|mother)/.test(h) },
  { key: "email", priority: 7, test: (h) => /(email|e mail)/.test(h) },
  { key: "previousBalance", priority: 7, test: (h) => /(pending|previous balance|prev balance|opening balance|old balance|arrear|outstanding)/.test(h) },
  { key: "discount", priority: 7, test: (h) => /(discount|discout|concession|waiver)/.test(h) },
  { key: "assignedFee", priority: 6, test: (h) => /(assigned fee|fee assigned|total fee|tuition|^fees?$|fee amount|annual fee)/.test(h) },
  { key: "totalBalance", priority: 5, test: (h) => /(total balance|end balance|net balance|closing balance)/.test(h) },
  { key: "serial", priority: 4, test: (h) => /(^sr ?no|^s ?no|^sl ?no|^roll ?no|^rollno|^srno|^sno|^#$)/.test(h) },
];

function matchHeader(h: string): Key | null {
  if (!h) return null;
  for (const r of RULES) if (r.test(h)) return r.key;
  return null;
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : 0;
  const s = String(v ?? "").replace(/[^0-9.-]/g, "");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function cleanPhone(v: unknown): string | undefined {
  const digits = String(v ?? "").replace(/\D/g, "");
  if (digits.length < 7) return undefined;
  return digits.slice(-12);
}

/** Detect the header row within the first 15 rows of a sheet. */
function findHeaderRow(aoa: unknown[][]): { index: number; map: Map<number, Key> } | null {
  const limit = Math.min(aoa.length, 15);
  let best: { index: number; map: Map<number, Key>; score: number } | null = null;

  for (let i = 0; i < limit; i++) {
    const map = new Map<number, Key>();
    const seen = new Set<Key>();
    aoa[i]?.forEach((cell, c) => {
      const key = matchHeader(norm(cell));
      if (!key || seen.has(key)) return;
      seen.add(key);
      map.set(c, key);
    });
    if (!seen.has("name")) continue;
    const score = seen.size;
    if (!best || score > best.score) best = { index: i, map, score };
  }
  return best ? { index: best.index, map: best.map } : null;
}

/** A stray "CLASS ;- JR.KG" title row above the table. */
function findTitleClass(aoa: unknown[][], headerIndex: number): string {
  for (let i = 0; i < headerIndex; i++) {
    for (const cell of aoa[i] ?? []) {
      const m = String(cell ?? "").match(/class\s*[;:\- ]+\s*(.+)$/i);
      if (m?.[1]) return m[1].trim();
    }
  }
  return "";
}

export function parseStudentWorkbook(
  buffer: ArrayBuffer,
  defaults: { className?: string; section?: string } = {},
): ParseResult {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const rows: ParsedStudentRow[] = [];
  const errors: string[] = [];
  const detected = new Set<string>();

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
    if (!aoa.length) continue;

    const header = findHeaderRow(aoa);
    if (!header) {
      errors.push(`Sheet "${sheetName}": could not find a header row with a student name column — skipped.`);
      continue;
    }
    header.map.forEach((k) => detected.add(k));
    const titleClass = findTitleClass(aoa, header.index);

    const sheetRows: Array<ParsedStudentRow & { serial?: string }> = [];

    for (let r = header.index + 1; r < aoa.length; r++) {
      const raw = aoa[r] ?? [];
      const get = (key: Key): unknown => {
        for (const [c, k] of header.map) if (k === key) return raw[c];
        return undefined;
      };

      const name = String(get("name") ?? "").replace(/\s+/g, " ").trim();
      if (!name || /^(name|student name|total)$/i.test(name)) continue;
      if (!/[a-zA-Z\u0900-\u097F]/.test(name)) continue;

      const warnings: string[] = [];
      const className = String(get("className") ?? "").trim() || titleClass || defaults.className || "";
      const section = String(get("section") ?? "").trim() || defaults.section || "A";
      const serial = String(get("serial") ?? "").trim();
      let admissionNo = String(get("admissionNo") ?? "").trim();
      if (!admissionNo) {
        admissionNo = serial ? `${sheetName.slice(0, 6)}-${serial}` : "";
        if (admissionNo) warnings.push("Admission number generated from serial number");
      }
      if (!className) {
        errors.push(`Sheet "${sheetName}" row ${r + 1}: no class found for "${name}" — skipped.`);
        continue;
      }
      if (!admissionNo) {
        errors.push(`Sheet "${sheetName}" row ${r + 1}: no admission/GR number for "${name}" — skipped.`);
        continue;
      }

      sheetRows.push({
        sheet: sheetName,
        rowNo: r + 1,
        admissionNo,
        name,
        className,
        section,
        serial,
        phone: cleanPhone(get("phone")),
        guardianName: String(get("guardianName") ?? "").trim() || undefined,
        email: String(get("email") ?? "").trim() || undefined,
        previousBalance: Math.max(0, toNumber(get("previousBalance"))),
        assignedFee: Math.max(0, toNumber(get("assignedFee"))),
        discount: Math.max(0, toNumber(get("discount"))),
        warnings,
      });
    }

    // Many school sheets put a class code (e.g. "JR.KG.1") in the PRN/GR column for
    // every pupil. That is a class marker, not a unique admission number — expand it
    // into a unique per-student code instead of dropping the rows as duplicates.
    const counts = new Map<string, number>();
    for (const row of sheetRows) {
      const key = row.admissionNo.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const used = new Map<string, number>();
    for (const row of sheetRows) {
      const key = row.admissionNo.toLowerCase();
      if ((counts.get(key) ?? 0) > 1) {
        const n = (used.get(key) ?? 0) + 1;
        used.set(key, n);
        const suffix = row.serial || String(n);
        row.admissionNo = `${row.admissionNo}-${suffix}`;
        row.warnings.push("Shared roll/PRN code — unique admission number generated");
      }
      delete (row as { serial?: string }).serial;
      rows.push(row);
    }
  }

  return { rows, errors, detectedColumns: Array.from(detected) };
}

