/**
 * `GET /web/items`'s cursor page: a filtered slice of the live item catalogue
 * (Inventory ADR-002, POPS-3329). An absent sort keeps the original id order;
 * the named sorts use a keyset cursor containing the final sort key and id.
 */
import { and, asc } from 'drizzle-orm';

import { items, type ItemRow } from '../../db/index.js';
import {
  countRows,
  hiddenInactiveConditions,
  matchConditions,
  unfilteredConditions,
} from './items-page-filters.js';
import { cursorCondition, cursorFor, nextCursorFor } from './items-page-sort-cursor.js';
import { sortDescriptor } from './items-page-sort-descriptor.js';

import type { WEB_LIFECYCLES, WEB_PLACEMENT_KINDS, WebItemsSort } from '../../contract/rest-web.js';
import type { CommandDb } from '../../domain/commands/index.js';

/** The filters `GET /web/items` accepts, already parsed off the query string. */
export interface WebItemsFilter {
  readonly typeKey?: string;
  readonly placementKind?: (typeof WEB_PLACEMENT_KINDS)[number];
  readonly locationId?: string;
  readonly containingItemId?: string;
  /** Only these item ids; an empty list matches nothing. */
  readonly ids?: readonly string[];
  /** Active items only when falsy (ADR-002: excluded from listings unless asked for). */
  readonly includeInactive?: boolean;
  readonly untyped?: boolean;
  readonly isContainer?: boolean;
  readonly access?: 'open' | 'closed';
  readonly isFull?: boolean;
  readonly lifecycle?: (typeof WEB_LIFECYCLES)[number];
  readonly legacyLabelOf?: string;
  readonly within?: string;
  readonly effectiveLocationId?: string;
}

/** One page of `GET /web/items`, including counts for the current view. */
export interface WebItemsPage {
  readonly rows: ItemRow[];
  readonly nextCursor: string | null;
  readonly total: number;
  readonly unfilteredTotal: number;
  readonly hiddenInactiveCount: number;
}

function hiddenInactiveCount(db: CommandDb, filter: WebItemsFilter, total: number): number {
  if (filter.lifecycle !== undefined || filter.includeInactive === true) return 0;
  return Math.max(0, countRows(db, hiddenInactiveConditions(db, filter)) - total);
}

/**
 * Read one page of live items matching `filter`, ordered by the requested
 * sort, in the caller's (read) transaction. Counts ignore the cursor.
 */
export function readWebItemsPage(
  db: CommandDb,
  filter: WebItemsFilter,
  request: { cursor?: string; limit: number; sort?: WebItemsSort }
): WebItemsPage {
  const cursor = cursorFor(request.cursor, request.sort);
  const match = matchConditions(db, filter);
  const total = countRows(db, match);
  const unfilteredTotal = countRows(db, unfilteredConditions(filter));
  const descriptor = request.sort === undefined ? null : sortDescriptor(request.sort);
  const rows = db
    .select()
    .from(items)
    .where(and(...match, cursorCondition(cursor, descriptor)))
    .orderBy(...(descriptor?.orderBy ?? [asc(items.id)]))
    .limit(request.limit + 1)
    .all();

  const page = rows.slice(0, request.limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > request.limit && last ? nextCursorFor(db, request.sort, last) : null;
  return {
    rows: page,
    nextCursor,
    total,
    unfilteredTotal,
    hiddenInactiveCount: hiddenInactiveCount(db, filter, total),
  };
}
