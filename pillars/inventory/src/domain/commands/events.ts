import { and, asc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';

import { events, type EventActorKind, type EventRow } from '../../db/index.js';
import { actorColumns, type EventActor } from './envelope.js';
import { jsonValueSchema, type ConflictSource, type JsonValue } from './outcome.js';

import type { CommandDb, EntityKind, FieldValues } from './entities.js';

const fieldListSchema = z.array(z.string());
const fieldValuesSchema = z.record(z.string(), jsonValueSchema);

/** An `events` row with its JSON columns parsed. */
export interface DomainEvent {
  readonly seq: number;
  readonly entityKind: EntityKind;
  readonly entityId: string;
  readonly kind: string;
  readonly fields: readonly string[];
  readonly before: Readonly<Record<string, JsonValue>>;
  readonly after: Readonly<Record<string, JsonValue>>;
  readonly entityRevision: number;
  readonly actorKind: EventActorKind;
  readonly actorLabel: string | null;
  readonly serverTime: string;
}

/** Parse an `events` row into a {@link DomainEvent}. */
export function toDomainEvent(row: EventRow): DomainEvent {
  return {
    seq: row.seq,
    entityKind: row.entityKind,
    entityId: row.entityId,
    kind: row.kind,
    fields: fieldListSchema.parse(JSON.parse(row.fields)),
    before: fieldValuesSchema.parse(JSON.parse(row.before)),
    after: fieldValuesSchema.parse(JSON.parse(row.after)),
    entityRevision: row.entityRevision,
    actorKind: row.actorKind,
    actorLabel: row.actorLabel,
    serverTime: row.serverTime,
  };
}

/**
 * The source a conflict names for the event that won: a phone by its label,
 * anything else (web, a service, the migration) as "Server".
 */
export function sourceOf(event: DomainEvent): ConflictSource {
  const label = event.actorKind === 'device' && event.actorLabel ? event.actorLabel : 'Server';
  return { kind: event.actorKind, label };
}

/** Everything an appended event records. */
export interface NewEvent {
  readonly entityKind: EntityKind;
  readonly entityId: string;
  readonly kind: string;
  readonly before: FieldValues;
  readonly after: FieldValues;
  readonly reason: string | null;
  readonly entityRevision: number;
  readonly actor: EventActor;
  readonly mutationId: string | null;
  readonly compensatesSeq: number | null;
  readonly clientTime: string | null;
  readonly serverTime: string;
}

/**
 * Append one event and return its `seq`, the new global change sequence.
 * `fields` is the key list of `after`, which is also the key list of `before`
 * for every change except a create.
 */
export function appendEvent(db: CommandDb, event: NewEvent): number {
  const inserted = db
    .insert(events)
    .values({
      entityKind: event.entityKind,
      entityId: event.entityId,
      kind: event.kind,
      fields: JSON.stringify(Object.keys(event.after)),
      before: JSON.stringify(event.before),
      after: JSON.stringify(event.after),
      reason: event.reason,
      entityRevision: event.entityRevision,
      ...actorColumns(event.actor),
      mutationId: event.mutationId,
      compensatesSeq: event.compensatesSeq,
      clientTime: event.clientTime,
      serverTime: event.serverTime,
    })
    .returning({ seq: events.seq })
    .get();
  return inserted.seq;
}

/** One event by `seq`, or `null`. */
export function loadEvent(db: CommandDb, seq: number): DomainEvent | null {
  const row = db.select().from(events).where(eq(events.seq, seq)).get();
  return row ? toDomainEvent(row) : null;
}

/** An entity's events whose resulting revision is above `revision`, oldest first. */
export function eventsAfterRevision(
  db: CommandDb,
  kind: EntityKind,
  id: string,
  revision: number
): DomainEvent[] {
  return db
    .select()
    .from(events)
    .where(
      and(eq(events.entityKind, kind), eq(events.entityId, id), gt(events.entityRevision, revision))
    )
    .orderBy(asc(events.seq))
    .all()
    .map(toDomainEvent);
}

/** An entity's events after `seq`, oldest first. */
export function eventsAfterSeq(
  db: CommandDb,
  kind: EntityKind,
  id: string,
  seq: number
): DomainEvent[] {
  return db
    .select()
    .from(events)
    .where(and(eq(events.entityKind, kind), eq(events.entityId, id), gt(events.seq, seq)))
    .orderBy(asc(events.seq))
    .all()
    .map(toDomainEvent);
}

/** The latest of `history` that touched `field`, or `undefined`. */
export function lastTouching(
  history: readonly DomainEvent[],
  field: string
): DomainEvent | undefined {
  return history.findLast((event) => event.fields.includes(field));
}
