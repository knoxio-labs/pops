import { and, asc, gt, lte } from 'drizzle-orm';

import { events, items, locations, type EventRow, type LocationRow } from '../../db/index.js';
import { resyncRequired } from './errors.js';
import { loadItemExtras, type ItemPageRows } from './wire.js';

import type { CommandDb } from '../../domain/commands/index.js';
import type { SyncState } from './meta.js';

/** One feed page, with its items still to be projected. */
export interface ChangeRows extends ItemPageRows {
  readonly epoch: string;
  readonly events: readonly EventRow[];
  readonly locations: readonly LocationRow[];
  readonly nextSince: number;
  readonly hasMore: boolean;
}

/**
 * Read one change-feed page after `since`, in the caller's read transaction.
 *
 * The page is the next `limit` events in `seq` order, up to some `seq` U, plus
 * every item and location (tombstones included) whose own `seq` falls in
 * `(since, U]`. A row's `seq` is the event that last changed it, so each row
 * appears exactly once, in the page holding its latest change; a row changed
 * again after U is left for a later page. `nextSince` is U.
 *
 * Another epoch, or a `since` beyond the latest `seq` (a database restored
 * from an older backup), is `409 resync_required`.
 */
export function readChanges(
  db: CommandDb,
  state: SyncState,
  request: { since: number; epoch: string; limit: number }
): ChangeRows {
  if (request.epoch !== state.epoch) {
    throw resyncRequired('the client is following another epoch');
  }
  if (request.since > state.maxSeq) {
    throw resyncRequired(`since ${request.since} is beyond this server's latest seq`);
  }

  const eventRows = db
    .select()
    .from(events)
    .where(gt(events.seq, request.since))
    .orderBy(asc(events.seq))
    .limit(request.limit)
    .all();
  const upTo = eventRows.at(-1)?.seq ?? request.since;

  const itemRows = db
    .select()
    .from(items)
    .where(and(gt(items.seq, request.since), lte(items.seq, upTo)))
    .orderBy(asc(items.seq))
    .all();
  const locationRows = db
    .select()
    .from(locations)
    .where(and(gt(locations.seq, request.since), lte(locations.seq, upTo)))
    .orderBy(asc(locations.seq))
    .all();

  return {
    epoch: state.epoch,
    events: eventRows,
    items: itemRows,
    locations: locationRows,
    extras: loadItemExtras(
      db,
      itemRows.map((row) => row.id)
    ),
    nextSince: upTo,
    hasMore: upTo < state.maxSeq,
  };
}
