/**
 * Fetch every page of a server-paginated list endpoint and flatten it into
 * a single array.
 *
 * The finance list endpoints cap `limit` server-side (see `LimitQuery`), so
 * a single request can no longer return "everything" once a collection
 * grows past that cap. List pages (transactions/budgets/entities/wishlist)
 * still filter/search/sort client-side over the full collection, so they
 * need the full collection, not one arbitrary page of it.
 */

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

/** Safety backstop against a server that never reports `hasMore: false`. */
const MAX_PAGES = 200;

/**
 * @param fetchPage fetches one page for the given `{ limit, offset }` (merged
 *   with any caller-supplied filters already baked into the closure).
 * @param pageSize  page size requested per round-trip. Defaults to the
 *   server-side cap (500) so the fewest possible requests are made.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: { limit: number; offset: number }) => Promise<PaginatedResult<T>>,
  pageSize = 500
): Promise<PaginatedResult<T>> {
  const all: T[] = [];
  let offset = 0;
  let total = 0;
  let hasMore = true;
  let pages = 0;

  while (hasMore && pages < MAX_PAGES) {
    const page = await fetchPage({ limit: pageSize, offset });
    all.push(...page.data);
    total = page.pagination.total;
    hasMore = page.pagination.hasMore && page.data.length > 0;
    offset += page.data.length;
    pages += 1;
  }

  return {
    data: all,
    pagination: { total, limit: all.length, offset: 0, hasMore },
  };
}
