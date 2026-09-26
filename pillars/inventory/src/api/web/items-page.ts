/**
 * `GET /web/items`'s cursor page: a filtered slice of the live item catalogue
 * (Inventory ADR-002, POPS-3329). An absent sort keeps the original id order;
 * the named sorts use a keyset cursor containing the final sort key and id.
 */
import { and, asc, sql } from 'drizzle-orm';
import { z } from 'zod';

import { WEB_ITEMS_SORTS } from '../../contract/rest-web.js';
import { items, type ItemRow } from '../../db/index.js';
import { ValidationError } from '../shared/errors.js';
import { decodeCursor, encodeCursor } from '../sync/cursor.js';
import { hiddenInactiveCount, readWebItemContentCounts } from './items-page-counts.js';
import {
  countRows,
  matchConditions,
  textSearchFor,
  unfilteredConditions,
} from './items-page-filters.js';
import {
  cursorCondition,
  cursorFor,
  nextCursorFor,
  sortedCursorAfter,
} from './items-page-sort-cursor.js';
import { rankedDescriptor, sortDescriptor } from './items-page-sort-descriptor.js';

import type { SQL } from 'drizzle-orm';

import type { WebItemContentCounts, WebItemsSort } from '../../contract/rest-web.js';
import type { CommandDb } from '../../domain/commands/index.js';
import type { WebItemsFilter } from './items-page-filters.js';
import type { CursorValue } from './items-page-sort-cursor.js';
import type { SortDescriptor } from './items-page-sort-descriptor.js';

export type { WebItemsFilter } from './items-page-filters.js';

/** One page of `GET /web/items`, including counts for the current view. */
export interface WebItemsPage {
  readonly rows: ItemRow[];
  readonly contentCounts: WebItemContentCounts;
  readonly nextCursor: string | null;
  readonly total: number;
  readonly unfilteredTotal: number;
  readonly hiddenInactiveCount: number;
}

const textCursorValueSchema = z.union([z.string(), z.number(), z.null()]);
const webItemsTextCursorSchema = z.object({
  v: z.literal(3),
  t: z.literal('web-items'),
  sort: z.enum(WEB_ITEMS_SORTS).nullable(),
  q: z.literal(true),
  key: z.array(textCursorValueSchema),
  after: z.string(),
});
type WebItemsTextCursor = z.infer<typeof webItemsTextCursorSchema>;

const textCursorKeyValidators: Record<WebItemsSort, (key: readonly CursorValue[]) => boolean> = {
  name: (key) => key.length === 1 && typeof key[0] === 'string',
  updated: (key) => key.length === 1 && typeof key[0] === 'string',
  type: (key) =>
    key.length === 2 &&
    (key[0] === null || typeof key[0] === 'string') &&
    typeof key[1] === 'string',
  where: (key) =>
    key.length === 3 &&
    (key[0] === null || typeof key[0] === 'string') &&
    (key[1] === null || typeof key[1] === 'string') &&
    typeof key[2] === 'string',
  packing: (key) => key.length === 2 && typeof key[0] === 'number' && typeof key[1] === 'string',
};

function validTextCursorKey(sort: WebItemsSort | null, key: readonly CursorValue[]): boolean {
  const tier = key[0];
  if (tier !== 1 && tier !== 2 && tier !== 3 && tier !== 4) return false;
  const sortKey = key.slice(1);
  return sort === null
    ? sortKey.length === 1 && typeof sortKey[0] === 'string'
    : textCursorKeyValidators[sort](sortKey);
}

function textCursorFor(
  cursor: string | undefined,
  sort: WebItemsSort | undefined
): WebItemsTextCursor | null {
  if (cursor === undefined) return null;
  try {
    const decoded = decodeCursor(webItemsTextCursorSchema, cursor);
    if (decoded.sort !== (sort ?? null) || !validTextCursorKey(decoded.sort, decoded.key)) {
      throw new Error();
    }
    return decoded;
  } catch {
    throw new ValidationError('The cursor was not issued by this route', { cursor });
  }
}

function textTierForRow(db: CommandDb, rank: SQL<number>, id: string): number {
  const tier = db
    .select({ tier: rank })
    .from(items)
    .where(sql`${items.id} = ${id}`)
    .get()?.tier;
  if (tier !== 1 && tier !== 2 && tier !== 3 && tier !== 4) {
    throw new Error(`web item ${id} did not match its text query`);
  }
  return tier;
}

function textSortKeyForRow(
  db: CommandDb,
  sort: WebItemsSort | undefined,
  row: ItemRow
): CursorValue[] {
  if (sort === undefined) return [row.name];
  const cursor = cursorFor(nextCursorFor(db, sort, row), sort);
  if (cursor?.kind !== 'sorted') throw new Error('web item sort did not issue a sorted cursor');
  return cursor.after.key;
}

function nextTextCursorFor(
  db: CommandDb,
  sort: WebItemsSort | undefined,
  row: ItemRow,
  rank: SQL<number>
): string {
  return encodeCursor({
    v: 3,
    t: 'web-items',
    sort: sort ?? null,
    q: true,
    key: [textTierForRow(db, rank, row.id), ...textSortKeyForRow(db, sort, row)],
    after: row.id,
  });
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
  const textSearch = filter.q === undefined ? null : textSearchFor(filter.q);
  const match = matchConditions(db, filter);
  if (textSearch !== null) match.push(textSearch.match);
  const total = countRows(db, match);
  const unfilteredTotal = countRows(db, unfilteredConditions(filter));
  let descriptor: SortDescriptor | null;
  let after: SQL | undefined;
  if (textSearch === null) {
    descriptor = request.sort === undefined ? null : sortDescriptor(request.sort);
    after = cursorCondition(cursorFor(request.cursor, request.sort), descriptor);
  } else {
    descriptor = rankedDescriptor(request.sort, textSearch.rank);
    const textCursor = textCursorFor(request.cursor, request.sort);
    after =
      textCursor === null
        ? undefined
        : sortedCursorAfter(descriptor, textCursor.key, textCursor.after);
  }
  const rows = db
    .select()
    .from(items)
    .where(and(...match, after))
    .orderBy(...(descriptor?.orderBy ?? [asc(items.id)]))
    .limit(request.limit + 1)
    .all();
  const page = rows.slice(0, request.limit);
  const last = page.at(-1);
  let nextCursor: string | null = null;
  if (rows.length > request.limit && last) {
    nextCursor =
      textSearch === null
        ? nextCursorFor(db, request.sort, last)
        : nextTextCursorFor(db, request.sort, last, textSearch.rank);
  }
  return {
    rows: page,
    contentCounts: readWebItemContentCounts(db, page),
    nextCursor,
    total,
    unfilteredTotal,
    hiddenInactiveCount: hiddenInactiveCount(db, filter, total, textSearch?.match),
  };
}
