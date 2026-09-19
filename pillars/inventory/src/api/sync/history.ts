import { and, desc, eq, lt } from 'drizzle-orm';
import { z } from 'zod';

import { events, items, type EventRow } from '../../db/index.js';
import { decodeCursor, encodeCursor } from './cursor.js';
import { invalidCursor } from './errors.js';

import type { CommandDb } from '../../domain/commands/index.js';

const historyCursorSchema = z.object({
  v: z.literal(1),
  t: z.literal('history'),
  item: z.string(),
  before: z.number().int().min(1),
});

/** One page of an item's history, newest first. */
export interface HistoryRows {
  readonly events: readonly EventRow[];
  readonly nextCursor: string | null;
}

/**
 * Read one page of item `id`'s events, newest first, in the caller's read
 * transaction. `null` when no such item exists; a tombstoned item still has
 * its history. A cursor issued for another item is `400 invalid_cursor`.
 */
export function readItemHistory(
  db: CommandDb,
  id: string,
  request: { cursor?: string; limit: number }
): HistoryRows | null {
  const item = db.select({ id: items.id }).from(items).where(eq(items.id, id)).get();
  if (!item) return null;

  let before: number | undefined;
  if (request.cursor !== undefined) {
    const position = decodeCursor(historyCursorSchema, request.cursor);
    if (position.item !== id) throw invalidCursor();
    before = position.before;
  }

  const rows = db
    .select()
    .from(events)
    .where(
      and(
        eq(events.entityKind, 'item'),
        eq(events.entityId, id),
        before === undefined ? undefined : lt(events.seq, before)
      )
    )
    .orderBy(desc(events.seq))
    .limit(request.limit + 1)
    .all();
  const page = rows.slice(0, request.limit);
  const oldest = page.at(-1);
  const nextCursor =
    rows.length > request.limit && oldest
      ? encodeCursor({ v: 1, t: 'history', item: id, before: oldest.seq })
      : null;
  return { events: page, nextCursor };
}
