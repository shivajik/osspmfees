export interface ListParams {
  q: string;
  page: number;
  pageSize: number;
  filters: Record<string, string>;
}

const DEFAULT_PAGE_SIZE = 10;

export function parseListParams(
  sp: Record<string, string | string[] | undefined>,
  opts: { filterKeys?: string[]; defaultPageSize?: number } = {},
): ListParams {
  const pick = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] ?? "" : v ?? "";
  };
  const page = Math.max(1, parseInt(pick("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(5, parseInt(pick("pageSize") || String(opts.defaultPageSize ?? DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
  const filters: Record<string, string> = {};
  (opts.filterKeys ?? []).forEach((k) => {
    const v = pick(k);
    if (v) filters[k] = v;
  });
  return { q: pick("q"), page, pageSize, filters };
}

export function paginate<T>(rows: T[], page: number, pageSize: number) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(page, totalPages);
  const start = (clamped - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), total, totalPages, page: clamped, pageSize };
}
