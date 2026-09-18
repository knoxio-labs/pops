import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

/** What an event is about (Inventory ADR-002 D4). */
export const EVENT_ENTITY_KINDS = ['item', 'location'] as const;
/** One of {@link EVENT_ENTITY_KINDS}. */
export type EventEntityKind = (typeof EVENT_ENTITY_KINDS)[number];

/** Who wrote an event: a phone via bfm, the web, a service account, or a migration. */
export const EVENT_ACTOR_KINDS = ['device', 'web', 'service', 'migration'] as const;
/** One of {@link EVENT_ACTOR_KINDS}. */
export type EventActorKind = (typeof EVENT_ACTOR_KINDS)[number];

/**
 * The append-only history of every item and location, and the sync change
 * sequence (Inventory ADR-002 D4): `seq` is autoincremented, and every
 * revisioned row's own `seq` names the last event that changed it.
 *
 * Contract: rows are never updated or deleted. Triggers `events_no_update`
 * and `events_no_delete` (migration `0012_items_single_identity`) abort any
 * attempt; drizzle cannot declare them. `fields` is a JSON array of the
 * touched field names (the wire's camelCase names); `before` and `after` are
 * JSON objects keyed by them. `kind` is validated by the command layer rather
 * than by a CHECK, because the event vocabulary grows without a table rebuild.
 */
export const events = sqliteTable(
  'events',
  {
    seq: integer('seq').primaryKey({ autoIncrement: true }),
    entityKind: text('entity_kind', { enum: EVENT_ENTITY_KINDS }).notNull(),
    entityId: text('entity_id').notNull(),
    kind: text('kind').notNull(),
    fields: text('fields').notNull(),
    before: text('before').notNull(),
    after: text('after').notNull(),
    reason: text('reason'),
    entityRevision: integer('entity_revision').notNull(),
    actorKind: text('actor_kind', { enum: EVENT_ACTOR_KINDS }).notNull(),
    actorId: text('actor_id'),
    actorLabel: text('actor_label'),
    mutationId: text('mutation_id'),
    compensatesSeq: integer('compensates_seq').references((): AnySQLiteColumn => events.seq),
    clientTime: text('client_time'),
    serverTime: text('server_time').notNull(),
  },
  (table) => [
    index('events_entity').on(table.entityKind, table.entityId, table.seq),
    check('ck_events_entity_kind', sql`${table.entityKind} IN ('item','location')`),
    check(
      'ck_events_actor_kind',
      sql`${table.actorKind} IN ('device','web','service','migration')`
    ),
    check(
      'ck_events_fields',
      sql`json_valid(${table.fields}) AND json_type(${table.fields}) = 'array'`
    ),
    check(
      'ck_events_before',
      sql`json_valid(${table.before}) AND json_type(${table.before}) = 'object'`
    ),
    check(
      'ck_events_after',
      sql`json_valid(${table.after}) AND json_type(${table.after}) = 'object'`
    ),
    check('ck_events_entity_revision', sql`${table.entityRevision} >= 1`),
  ]
);
