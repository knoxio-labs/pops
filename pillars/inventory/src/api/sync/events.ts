import { SyncEventValuesSchema } from '../../contract/rest-sync-schemas.js';
import {
  eventsAfterSeq,
  sourceOf,
  toDomainEvent,
  type DomainEvent,
} from '../../domain/commands/events.js';
import { isRevertible } from '../../domain/commands/revert.js';

import type { z } from 'zod';

import type { SyncEventSchema } from '../../contract/rest-sync-schemas.js';
import type { EventRow } from '../../db/index.js';
import type { CommandDb } from '../../domain/commands/index.js';

/** An event on the wire. */
export type SyncEvent = z.infer<typeof SyncEventSchema>;

function entityKey(event: { entityKind: string; entityId: string }): string {
  return `${event.entityKind}:${event.entityId}`;
}

/**
 * Every event of each entity in `rows`, from the earliest `seq` the page holds
 * for it onwards: what decides whether a later change superseded one of them.
 */
function historiesFrom(db: CommandDb, rows: readonly EventRow[]): Map<string, DomainEvent[]> {
  const earliest = new Map<string, EventRow>();
  for (const row of rows) {
    const key = entityKey(row);
    const known = earliest.get(key);
    if (!known || row.seq < known.seq) earliest.set(key, row);
  }
  const histories = new Map<string, DomainEvent[]>();
  for (const [key, row] of earliest) {
    histories.set(key, eventsAfterSeq(db, row.entityKind, row.entityId, row.seq - 1));
  }
  return histories;
}

function supersededIn(history: readonly DomainEvent[], event: DomainEvent): boolean {
  return history.some(
    (later) => later.seq > event.seq && later.fields.some((field) => event.fields.includes(field))
  );
}

function toSyncEvent(row: EventRow, domain: DomainEvent, undoable: boolean): SyncEvent {
  return {
    seq: row.seq,
    entityKind: row.entityKind,
    entityId: row.entityId,
    kind: row.kind,
    fields: [...domain.fields],
    before: SyncEventValuesSchema.parse(domain.before),
    after: SyncEventValuesSchema.parse(domain.after),
    reason: row.reason,
    actor: sourceOf(domain),
    clientTime: row.clientTime,
    serverTime: row.serverTime,
    compensatesSeq: row.compensatesSeq,
    undoable,
  };
}

/**
 * Project event rows onto the wire, in the order given. `undoable` is decided
 * now, against the whole log: `event.revert` would accept the event's kind,
 * and no later event of the same entity touched any of its fields. It can
 * only go from true to false, and the event that flips it reaches the client
 * through the same feed.
 */
export function toSyncEvents(db: CommandDb, rows: readonly EventRow[]): SyncEvent[] {
  const histories = historiesFrom(db, rows);
  return rows.map((row) => {
    const domain = toDomainEvent(row);
    const history = histories.get(entityKey(row)) ?? [];
    const undoable = isRevertible(domain) && !supersededIn(history, domain);
    return toSyncEvent(row, domain, undoable);
  });
}
