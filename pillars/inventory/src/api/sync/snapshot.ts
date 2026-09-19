import { and, asc, count, gt, isNull, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { items, locations, type ItemRow, type LocationRow } from '../../db/index.js';
import { decodeCursor, encodeCursor } from './cursor.js';
import { resyncRequired } from './errors.js';
import { loadItemExtras, type ItemPageRows } from './wire.js';

import type { CommandDb } from '../../domain/commands/index.js';
import type { SyncState } from './meta.js';

/**
 * Where a snapshot stands between pages: the epoch and high-water `seq` the
 * first page fixed, the table being paged (locations first, so a client can
 * resolve every item's place as it arrives) and the last id served in it.
 */
const snapshotCursorSchema = z.object({
  v: z.literal(1),
  t: z.literal('snapshot'),
  epoch: z.string(),
  hw: z.number().int().min(0),
  phase: z.enum(['locations', 'items']),
  after: z.string().nullable(),
});
type SnapshotPosition = z.infer<typeof snapshotCursorSchema>;

/** One snapshot page, with its items still to be projected. */
export interface SnapshotRows extends ItemPageRows {
  readonly epoch: string;
  readonly highWaterSeq: number;
  readonly total: number;
  readonly locations: readonly LocationRow[];
  readonly nextCursor: string | null;
}

function afterId(
  column: typeof items.id | typeof locations.id,
  after: string | null
): SQL | undefined {
  return after === null ? undefined : gt(column, after);
}

function liveLocations(db: CommandDb, after: string | null, limit: number): LocationRow[] {
  return db
    .select()
    .from(locations)
    .where(and(isNull(locations.deletedAt), afterId(locations.id, after)))
    .orderBy(asc(locations.id))
    .limit(limit)
    .all();
}

function liveItems(db: CommandDb, after: string | null, limit: number): ItemRow[] {
  return db
    .select()
    .from(items)
    .where(and(isNull(items.deletedAt), afterId(items.id, after)))
    .orderBy(asc(items.id))
    .limit(limit)
    .all();
}

function liveTotal(db: CommandDb): number {
  const places = db.select({ n: count() }).from(locations).where(isNull(locations.deletedAt)).get();
  const things = db.select({ n: count() }).from(items).where(isNull(items.deletedAt)).get();
  return (places?.n ?? 0) + (things?.n ?? 0);
}

function startOrResume(state: SyncState, cursor: string | undefined): SnapshotPosition {
  if (cursor === undefined) {
    return {
      v: 1,
      t: 'snapshot',
      epoch: state.epoch,
      hw: state.maxSeq,
      phase: 'locations',
      after: null,
    };
  }
  const position = decodeCursor(snapshotCursorSchema, cursor);
  if (position.epoch !== state.epoch) {
    throw resyncRequired('the snapshot began under another epoch');
  }
  if (position.hw > state.maxSeq) {
    throw resyncRequired('the snapshot began at a seq this server no longer has');
  }
  return position;
}

interface Paged<Row> {
  readonly rows: Row[];
  readonly more: boolean;
}

function take<Row>(rows: Row[], limit: number): Paged<Row> {
  return { rows: rows.slice(0, limit), more: rows.length > limit };
}

function lastId(rows: readonly { id: string }[]): string | null {
  return rows.at(-1)?.id ?? null;
}

type Continuation = Pick<SnapshotPosition, 'phase' | 'after'>;

interface PageRows {
  readonly places: LocationRow[];
  readonly things: ItemRow[];
  readonly next: Continuation | null;
}

function pageFrom(db: CommandDb, position: Continuation, limit: number): PageRows {
  if (position.phase === 'items') {
    const things = take(liveItems(db, position.after, limit + 1), limit);
    const next: Continuation | null = things.more
      ? { phase: 'items', after: lastId(things.rows) }
      : null;
    return { places: [], things: things.rows, next };
  }
  const places = take(liveLocations(db, position.after, limit + 1), limit);
  if (places.more) {
    return {
      places: places.rows,
      things: [],
      next: { phase: 'locations', after: lastId(places.rows) },
    };
  }
  const room = limit - places.rows.length;
  if (room === 0) {
    const itemsFollow = liveItems(db, null, 1).length > 0;
    return {
      places: places.rows,
      things: [],
      next: itemsFollow ? { phase: 'items', after: null } : null,
    };
  }
  return { ...pageFrom(db, { phase: 'items', after: null }, room), places: places.rows };
}

/**
 * Read one snapshot page in the caller's read transaction.
 *
 * Only live rows are served; the first page fixes the high-water `seq` S that
 * every later page repeats. Rows are read as they are now, so one changed or
 * created while paging may be newer than S or be missed by the id order; both
 * are safe because its change has a `seq` above S, which the feed from S
 * delivers, and the client upserts by revision.
 */
export function readSnapshotPage(
  db: CommandDb,
  state: SyncState,
  request: { cursor?: string; limit: number }
): SnapshotRows {
  const position = startOrResume(state, request.cursor);
  const page = pageFrom(db, position, request.limit);
  return {
    epoch: position.epoch,
    highWaterSeq: position.hw,
    total: liveTotal(db),
    locations: page.places,
    items: page.things,
    extras: loadItemExtras(
      db,
      page.things.map((row) => row.id)
    ),
    nextCursor: page.next === null ? null : encodeCursor({ ...position, ...page.next }),
  };
}
