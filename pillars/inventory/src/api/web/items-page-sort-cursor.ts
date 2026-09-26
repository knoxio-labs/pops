import { and, gt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { loadPublishedCatalogue } from '../../catalogue/index.js';
import { WEB_ITEMS_SORTS } from '../../contract/rest-web.js';
import { items, locations, type ItemRow } from '../../db/index.js';
import { ValidationError } from '../shared/errors.js';
import { decodeCursor, encodeCursor } from '../sync/cursor.js';
import { effectiveLocationIdSql } from './placement-scope.js';

import type { WebItemsSort } from '../../contract/rest-web.js';
import type { CommandDb } from '../../domain/commands/index.js';
import type { SortDescriptor, SortKeySpec } from './items-page-sort-descriptor.js';

const webItemsCursorSchema = z.object({
  v: z.literal(1),
  t: z.literal('web-items'),
  after: z.string(),
});

const cursorValueSchema = z.union([z.string(), z.number(), z.null()]);
const webItemsSortedCursorSchema = z.object({
  v: z.literal(2),
  t: z.literal('web-items'),
  sort: z.enum(WEB_ITEMS_SORTS),
  key: z.array(cursorValueSchema),
  after: z.string(),
});

export type CursorValue = z.infer<typeof cursorValueSchema>;
type SortedCursor = z.infer<typeof webItemsSortedCursorSchema>;
export type WebItemsCursor =
  | { readonly kind: 'id'; readonly after: string }
  | { readonly kind: 'sorted'; readonly after: SortedCursor };

function andConditions(conditions: readonly SQL[]): SQL {
  return and(...conditions) ?? sql`1`;
}

function orConditions(conditions: readonly SQL[]): SQL {
  return or(...conditions) ?? sql`0`;
}

function comparableExpression(spec: SortKeySpec): SQL {
  return spec.caseInsensitive ? sql`${spec.expression} COLLATE NOCASE` : sql`${spec.expression}`;
}

function keyAfter(spec: SortKeySpec, value: CursorValue): SQL {
  if (value === null) return sql`0`;
  const expression = comparableExpression(spec);
  const comparison =
    spec.direction === 'asc' ? sql`${expression} > ${value}` : sql`${expression} < ${value}`;
  if (spec.nullsLast) return sql`(${spec.expression} IS NULL OR ${comparison})`;
  return comparison;
}

function keyEqual(spec: SortKeySpec, value: CursorValue): SQL {
  if (value === null) return sql`${spec.expression} IS NULL`;
  return sql`${comparableExpression(spec)} = ${value}`;
}

/** Build the predicate strictly after a sorted cursor tuple. */
export function sortedCursorAfter(
  descriptor: SortDescriptor,
  key: readonly CursorValue[],
  after: string
): SQL {
  const clauses: SQL[] = [];
  const prefix: SQL[] = [];
  for (let index = 0; index < descriptor.keys.length; index += 1) {
    const spec = descriptor.keys[index];
    const value = key[index];
    if (spec === undefined || value === undefined) return sql`0`;
    clauses.push(andConditions([...prefix, keyAfter(spec, value)]));
    prefix.push(keyEqual(spec, value));
  }
  clauses.push(andConditions([...prefix, gt(items.id, after)]));
  return orConditions(clauses);
}

const keyValidators: Record<WebItemsSort, (key: readonly CursorValue[]) => boolean> = {
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

/** Decode a web item cursor and reject a cursor issued for another order. */
export function cursorFor(
  cursor: string | undefined,
  sort: WebItemsSort | undefined
): WebItemsCursor | null {
  if (cursor === undefined) return null;
  try {
    if (sort === undefined) {
      return { kind: 'id', after: decodeCursor(webItemsCursorSchema, cursor).after };
    }

    const decoded = decodeCursor(webItemsSortedCursorSchema, cursor);
    if (decoded.sort !== sort || !keyValidators[sort](decoded.key)) throw new Error();
    return { kind: 'sorted', after: decoded };
  } catch {
    throw new ValidationError('The cursor was not issued by this route', { cursor });
  }
}

/** Turn a decoded cursor into the predicate used by the current page query. */
export function cursorCondition(
  cursor: WebItemsCursor | null,
  descriptor: SortDescriptor | null
): SQL | undefined {
  if (cursor?.kind === 'id') return gt(items.id, cursor.after);
  if (cursor?.kind === 'sorted' && descriptor !== null) {
    return sortedCursorAfter(descriptor, cursor.after.key, cursor.after.after);
  }
  return undefined;
}

function effectiveLocationForRow(
  db: CommandDb,
  row: ItemRow
): { readonly id: string | null; readonly name: string | null } {
  const effective = db
    .select({ id: effectiveLocationIdSql() })
    .from(items)
    .where(sql`${items.id} = ${row.id}`)
    .get();
  const id = effective?.id ?? null;
  if (id === null) return { id, name: null };
  return {
    id,
    name:
      db
        .select({ name: locations.name })
        .from(locations)
        .where(sql`${locations.id} = ${id}`)
        .get()?.name ?? null,
  };
}

function typeSortKey(row: ItemRow, typeLabels: ReadonlyMap<string, string>): string | null {
  if (row.typeId === null) return null;
  return typeLabels.get(row.typeId) ?? null;
}

function packingRankForRow(row: ItemRow): number {
  if (row.access === 'closed') return 2;
  if (row.isContainer === 1 && row.isFull === 1) return 1;
  return 0;
}

function sortKeyForRow(
  db: CommandDb,
  row: ItemRow,
  sort: WebItemsSort,
  typeLabels: ReadonlyMap<string, string>
): CursorValue[] {
  switch (sort) {
    case 'name':
      return [row.name];
    case 'updated':
      return [row.updatedAt];
    case 'type':
      return [typeSortKey(row, typeLabels), row.name];
    case 'where': {
      const location = effectiveLocationForRow(db, row);
      return [location.name, location.id, row.name];
    }
    case 'packing':
      return [packingRankForRow(row), row.name];
  }
}

/** Encode the next cursor from the final row of a fetched web item page. */
export function nextCursorFor(
  db: CommandDb,
  sort: WebItemsSort | undefined,
  last: ItemRow
): string {
  if (sort === undefined) return encodeCursor({ v: 1, t: 'web-items', after: last.id });

  const typeLabels = new Map(
    loadPublishedCatalogue(db)?.types.map((type) => [type.id, type.label]) ?? []
  );
  return encodeCursor({
    v: 2,
    t: 'web-items',
    sort,
    key: sortKeyForRow(db, last, sort, typeLabels),
    after: last.id,
  });
}
