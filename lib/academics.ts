/**
 * Class-name normalisation + ordering.
 *
 * The seeded/imported data mixes numbering standards ("VIII", "8th", "Class 8",
 * "JR.KG", "Jr.Kg"). The app displays a single standard — regular numbers —
 * and sorts pre-primary → primary → higher classes.
 */

const ROMAN: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
  xi: 11, xii: 12,
};

/** Pre-primary levels, in order, before class 1. */
const PRE_PRIMARY: { match: RegExp; label: string; rank: number }[] = [
  { match: /^(play\s*group|playgroup|pg)$/i, label: "Playgroup", rank: -40 },
  { match: /^(nursery|nur)$/i, label: "Nursery", rank: -30 },
  { match: /^(jr\.?\s*kg|junior\s*kg|lkg)\s*\d*$/i, label: "Jr. KG", rank: -20 },
  { match: /^(sr\.?\s*kg|senior\s*kg|ukg)\s*\d*$/i, label: "Sr. KG", rank: -10 },
];

function core(raw: string): string {
  return raw
    .trim()
    .replace(/^(class|std\.?|standard|grade)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Streams offered in classes 11 and 12. */
export const STREAMS = [
  "Arts", "Commerce", "Science",
  "Medical", "Non-Medical", "Medical & Non-Medical",
  "Vocational",
] as const;

/** Matches a stream at the end of a class name ("Class 11 Non-Medical" → "Non-Medical"). */
export const STREAM_SUFFIX = new RegExp(
  `\\s(${[...STREAMS]
    .sort((a, b) => b.length - a.length)
    .map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})$`,
  "i",
);

/** Splits "11th Arts" / "XI Science" / "Class 12 Commerce" into level + stream. */
function parseLevel(raw: string): { level: number; stream: string } | null {
  const c = core(raw);
  const m = c.match(/^(\d{1,2}|[ivx]{1,4})\.?\s*(st|nd|rd|th)?\.?(?:\s*[-–(]?\s*(.+?)\)?)?$/i);
  if (!m) return null;
  const level = /^\d/.test(m[1]) ? Number(m[1]) : ROMAN[m[1].toLowerCase()];
  if (!level) return null;
  const rest = (m[3] ?? "").trim();
  if (!rest) return { level, stream: "" };
  const stream = STREAMS.find((st) => st.toLowerCase() === rest.toLowerCase());
  // Only a known stream counts; anything else is not a numbered class.
  return stream ? { level, stream } : null;
}

/** Numeric level of a class name, or null when it is not a numbered class. */
export function classLevel(raw: string): number | null {
  return parseLevel(raw)?.level ?? null;
}

/** Stream of a class ("Arts", "Science"…), or "" when it has none. */
export function classStream(raw: string): string {
  return parseLevel(raw)?.stream ?? "";
}

/** Single display standard: regular numbers ("Class 8"), tidy pre-primary labels. */
export function normalizeClassName(raw: string): string {
  const c = core(raw);
  for (const p of PRE_PRIMARY) if (p.match.test(c)) return p.label;
  const parsed = parseLevel(raw);
  if (parsed) return parsed.stream ? `Class ${parsed.level} ${parsed.stream}` : `Class ${parsed.level}`;
  return c || raw;
}

/** Sort rank: pre-primary first, then class 1..12, then anything else. */
export function classRank(raw: string): number {
  const c = core(raw);
  for (const p of PRE_PRIMARY) if (p.match.test(c)) return p.rank;
  const level = classLevel(raw);
  if (level !== null) return level;
  return 1000;
}

export function compareClassNames(a: string, b: string): number {
  const ra = classRank(a);
  const rb = classRank(b);
  if (ra !== rb) return ra - rb;
  return normalizeClassName(a).localeCompare(normalizeClassName(b), undefined, { numeric: true });
}

/** Keep the first record per key — used to collapse the same entity repeated per institute. */
export function dedupeBy<T>(rows: T[], key: (row: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const k = key(row);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out;
}
