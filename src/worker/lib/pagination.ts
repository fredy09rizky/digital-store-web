/**
 * Helper pagination offset-based untuk admin list.
 *
 * Konvensi:
 *   - Query param `page` (default 1, min 1).
 *   - Query param `page_size` (default 50, min 1, max 200).
 *   - Response shape: `{ items, page, pageSize, total }`.
 */

export interface PaginationParams {
  page: number;
  pageSize: number;
  offset: number;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export function parsePagination(req: { query: (k: string) => string | undefined }): PaginationParams {
  const rawPage = parseInt(req.query("page") ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.min(rawPage, 100_000) : 1;
  const rawSize = parseInt(req.query("page_size") ?? `${DEFAULT_PAGE_SIZE}`, 10);
  const pageSize = Number.isFinite(rawSize) && rawSize >= 1 ? Math.min(rawSize, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export function buildPage<T>(items: T[], total: number, p: PaginationParams): Page<T> {
  return { items, total, page: p.page, pageSize: p.pageSize };
}
