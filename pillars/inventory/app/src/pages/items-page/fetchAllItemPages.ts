import { unwrap } from '../../inventory-api-helpers.js';
import { itemsList } from '../../inventory-api/index.js';

import type { ItemsListResponses } from '../../inventory-api/types.gen.js';
import type { buildQueryInput } from './useItemsPageFilters';

type InventoryItem = ItemsListResponses['200']['data'][number];
type ItemsListPage = ItemsListResponses['200'];

// A malformed or adversarial `hasMore`/`offset` pair could otherwise page
// forever; this bounds a single list fetch well past any real library.
const MAX_ITEM_PAGES = 500;

// Offset pagination has no cursor: if a row is deleted between two page
// requests, everything after it shifts left by one and the row that would
// have landed on the next page's offset is never fetched by either request
// (a real fix needs keyset pagination, out of scope here — POPS-43). Since
// `pagination.total` is recomputed on every request, a shrinking total
// across a single walk is a reliable signal that this happened; retrying the
// whole walk trades a few extra requests for a snapshot from a moment when
// nothing changed underneath it, which is the common case for this list.
const MAX_CONSISTENCY_ATTEMPTS = 3;

interface ItemPagesWalk {
  page: ItemsListPage;
  /** True if `pagination.total` differed between any two pages of this walk. */
  driftDetected: boolean;
}

async function walkItemPagesOnce(
  queryInput: ReturnType<typeof buildQueryInput>,
  signal: AbortSignal
): Promise<ItemPagesWalk> {
  const seenIds = new Set<string>();
  const data: InventoryItem[] = [];
  let pagination: ItemsListPage['pagination'] | undefined;
  let totals: ItemsListPage['totals'] | undefined;
  let offset = 0;
  let driftDetected = false;

  for (let page = 0; page < MAX_ITEM_PAGES; page++) {
    const result = unwrap(await itemsList({ query: { ...queryInput, offset }, signal }));
    if (pagination !== undefined && result.pagination.total !== pagination.total) {
      driftDetected = true;
    }
    for (const item of result.data) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      data.push(item);
    }
    pagination = result.pagination;
    totals = result.totals;
    if (!result.pagination.hasMore) break;
    offset = result.pagination.offset + result.pagination.limit;
  }

  return {
    page: {
      data,
      pagination: pagination ?? { total: 0, limit: queryInput.limit, offset: 0, hasMore: false },
      totals: totals ?? { totalReplacementValue: 0, totalResaleValue: 0 },
    },
    driftDetected,
  };
}

/**
 * Fetches every page of `GET /items` for the given filters, starting at
 * offset 0 and following `pagination.hasMore` until the server reports no
 * more rows. `signal` is forwarded to each request so an aborted caller (see
 * `useItemsPageModel`, which cancels a stale walk on filter change) stops
 * issuing further page requests instead of paging in the background.
 *
 * Retries the whole walk (bounded) if the reported total changed mid-walk,
 * since that means a write raced the walk and may have caused it to miss a
 * row (see `MAX_CONSISTENCY_ATTEMPTS`). The last attempt's result is
 * returned even if drift was detected on every attempt, rather than
 * blocking the page indefinitely under sustained concurrent writes.
 */
export async function fetchAllItemPages(
  queryInput: ReturnType<typeof buildQueryInput>,
  signal: AbortSignal
): Promise<ItemsListPage> {
  let attempt = await walkItemPagesOnce(queryInput, signal);
  for (let i = 1; i < MAX_CONSISTENCY_ATTEMPTS && attempt.driftDetected; i++) {
    attempt = await walkItemPagesOnce(queryInput, signal);
  }
  return attempt.page;
}
