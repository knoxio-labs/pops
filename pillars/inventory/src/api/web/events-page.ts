import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { events, items, locations, type EventActorKind, type EventRow } from '../../db/index.js';
import { decodeCursor, encodeCursor } from '../sync/cursor.js';

import type { SQL, SQLWrapper } from 'drizzle-orm';

import type { CommandDb } from '../../domain/commands/index.js';

const webEventsCursorSchema = z.object({
  v: z.literal(1),
  t: z.literal('web-events'),
  before: z.number().int().min(1),
});

interface WebEventsFilter {
  readonly kinds?: readonly string[];
  readonly actorKind?: EventActorKind;
  readonly entityId?: string;
  readonly q?: string;
}

interface WebEventsRequest {
  readonly cursor?: string;
  readonly limit: number;
}

/** One cursor-paged page of global inventory events and its filter counts. */
export interface WebEventsPage {
  readonly rows: EventRow[];
  readonly names: Map<string, string>;
  readonly nextCursor: string | null;
  readonly kindCounts: Record<string, number>;
  readonly total: number;
}

function eventKey(entityKind: string, entityId: string): string {
  return `${entityKind}:${entityId}`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

function like(expression: SQLWrapper, pattern: string): SQL {
  return sql`lower(${expression}) LIKE lower(${pattern}) ESCAPE '\\'`;
}

function anyOf(conditions: readonly SQL[]): SQL {
  return or(...conditions) ?? sql`0`;
}

function eventEntityName(): SQL<string | null> {
  return sql<string | null>`CASE
    WHEN ${events.entityKind} = 'item' THEN (
      SELECT ${items.name}
      FROM ${items}
      WHERE ${items.id} = ${events.entityId}
    )
    ELSE (
      SELECT ${locations.name}
      FROM ${locations}
      WHERE ${locations.id} = ${events.entityId}
    )
  END`;
}

function jsonTextMatch(column: SQLWrapper, pattern: string): SQL {
  return sql`EXISTS (
    SELECT 1
    FROM json_tree(${column}) AS text_value
    WHERE text_value.type = 'text'
      AND lower(text_value.value) LIKE lower(${pattern}) ESCAPE '\\'
  )`;
}

function jsonReferencedNameMatch(column: SQLWrapper, pattern: string): SQL {
  return sql`EXISTS (
    SELECT 1
    FROM json_tree(${column}) AS reference
    WHERE reference.type = 'text'
      AND (
        EXISTS (
          SELECT 1
          FROM ${items}
          WHERE ${items.id} = reference.value
            AND ${like(items.name, pattern)}
        )
        OR EXISTS (
          SELECT 1
          FROM ${locations}
          WHERE ${locations.id} = reference.value
            AND ${like(locations.name, pattern)}
        )
      )
  )`;
}

function queryMatch(q: string): SQL {
  const pattern = `%${escapeLike(q)}%`;
  return anyOf([
    like(eventEntityName(), pattern),
    sql`EXISTS (
      SELECT 1
      FROM json_each(${events.fields}) AS touched_field
      WHERE touched_field.type = 'text'
        AND ${like(sql`touched_field.value`, pattern)}
    )`,
    jsonTextMatch(events.before, pattern),
    jsonTextMatch(events.after, pattern),
    jsonReferencedNameMatch(events.before, pattern),
    jsonReferencedNameMatch(events.after, pattern),
  ]);
}

function baseConditions(filter: WebEventsFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.actorKind !== undefined) conditions.push(eq(events.actorKind, filter.actorKind));
  if (filter.entityId !== undefined) conditions.push(eq(events.entityId, filter.entityId));
  const q = filter.q?.trim();
  if (q !== undefined && q.length > 0) conditions.push(queryMatch(q));
  return conditions;
}

function kindCondition(kinds: readonly string[] | undefined): SQL | undefined {
  if (kinds === undefined) return undefined;
  if (kinds.length === 0) return sql`0`;
  return inArray(events.kind, Array.from(kinds));
}

function cursorBefore(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  return decodeCursor(webEventsCursorSchema, raw).before;
}

function readEntityNames(db: CommandDb, rows: readonly EventRow[]): Map<string, string> {
  const names = new Map<string, string>();
  const itemIds = rows.filter((row) => row.entityKind === 'item').map((row) => row.entityId);
  const locationIds = rows
    .filter((row) => row.entityKind === 'location')
    .map((row) => row.entityId);

  if (itemIds.length > 0) {
    for (const row of db
      .select({ id: items.id, name: items.name })
      .from(items)
      .where(inArray(items.id, itemIds))
      .all()) {
      names.set(eventKey('item', row.id), row.name);
    }
  }
  if (locationIds.length > 0) {
    for (const row of db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(inArray(locations.id, locationIds))
      .all()) {
      names.set(eventKey('location', row.id), row.name);
    }
  }
  return names;
}

/**
 * Read the global inventory event feed, including counts for the current
 * actor, entity and text filters. The kind filter and cursor apply only to
 * the returned page.
 */
export function readWebEventsPage(
  db: CommandDb,
  filter: WebEventsFilter,
  request: WebEventsRequest
): WebEventsPage {
  const base = baseConditions(filter);
  const totalRow = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(events)
    .where(and(...base))
    .get();
  const total = totalRow?.count ?? 0;

  const kindCounts: Record<string, number> = {};
  for (const row of db
    .select({ kind: events.kind, count: sql<number>`COUNT(*)` })
    .from(events)
    .where(and(...base))
    .groupBy(events.kind)
    .all()) {
    kindCounts[row.kind] = row.count;
  }

  const before = cursorBefore(request.cursor);
  const pageRows = db
    .select()
    .from(events)
    .where(
      and(
        ...base,
        kindCondition(filter.kinds),
        before === undefined ? undefined : lt(events.seq, before)
      )
    )
    .orderBy(desc(events.seq))
    .limit(request.limit + 1)
    .all();
  const rows = pageRows.slice(0, request.limit);
  const oldest = rows.at(-1);
  const nextCursor =
    pageRows.length > request.limit && oldest
      ? encodeCursor({ v: 1, t: 'web-events', before: oldest.seq })
      : null;

  return { rows, names: readEntityNames(db, rows), nextCursor, kindCounts, total };
}
