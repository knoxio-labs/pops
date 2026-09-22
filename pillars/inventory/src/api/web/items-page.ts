/**
 * `GET /web/items`'s cursor page: a filtered, id-ordered slice of the live
 * item catalogue (Inventory ADR-002, POPS-3329). Ordered by `id` rather than
 * `seq` or `createdAt` so a row inserted anywhere never reshuffles a page
 * already served — the property the delivery plan calls "cursor stable
 * under inserts".
 */
import { and, asc, eq, gt, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { resolvePublishedType } from '../../catalogue/index.js';
import { items, type ItemRow } from '../../db/index.js';
import { ValidationError } from '../shared/errors.js';
import { decodeCursor, encodeCursor } from '../sync/cursor.js';

import type { WEB_PLACEMENT_KINDS } from '../../contract/rest-web.js';
import type { CommandDb } from '../../domain/commands/index.js';

const webItemsCursorSchema = z.object({
  v: z.literal(1),
  t: z.literal('web-items'),
  after: z.string(),
});

/** The filters `GET /web/items` accepts, already parsed off the query string. */
export interface WebItemsFilter {
  readonly typeKey?: string;
  readonly placementKind?: (typeof WEB_PLACEMENT_KINDS)[number];
  readonly locationId?: string;
  readonly containingItemId?: string;
  /** Active items only when falsy (ADR-002: excluded from listings unless asked for). */
  readonly includeInactive?: boolean;
}

/** One page of `GET /web/items`. */
export interface WebItemsPage {
  readonly rows: ItemRow[];
  readonly nextCursor: string | null;
}

function filterConditions(db: CommandDb, filter: WebItemsFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.typeKey !== undefined) {
    const type = resolvePublishedType(db, { key: filter.typeKey });
    conditions.push(type === null ? sql`0` : eq(items.typeId, type.id));
  }
  if (filter.placementKind !== undefined) {
    conditions.push(eq(items.placementKind, filter.placementKind));
  }
  if (filter.locationId !== undefined) conditions.push(eq(items.locationId, filter.locationId));
  if (filter.containingItemId !== undefined) {
    conditions.push(eq(items.containingItemId, filter.containingItemId));
  }
  if (!filter.includeInactive) conditions.push(eq(items.lifecycle, 'active'));
  return conditions;
}

/** `request.cursor`, decoded and checked; a cursor this route did not issue is a 400. */
function afterFrom(cursor: string | undefined): string | null {
  if (cursor === undefined) return null;
  try {
    return decodeCursor(webItemsCursorSchema, cursor).after;
  } catch {
    throw new ValidationError('The cursor was not issued by this route', { cursor });
  }
}

/**
 * Read one page of live items matching `filter`, ordered by `id`, in the
 * caller's (read) transaction.
 */
export function readWebItemsPage(
  db: CommandDb,
  filter: WebItemsFilter,
  request: { cursor?: string; limit: number }
): WebItemsPage {
  const after = afterFrom(request.cursor);
  const rows = db
    .select()
    .from(items)
    .where(
      and(
        isNull(items.deletedAt),
        after === null ? undefined : gt(items.id, after),
        ...filterConditions(db, filter)
      )
    )
    .orderBy(asc(items.id))
    .limit(request.limit + 1)
    .all();

  const page = rows.slice(0, request.limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > request.limit && last
      ? encodeCursor({ v: 1, t: 'web-items', after: last.id })
      : null;
  return { rows: page, nextCursor };
}
