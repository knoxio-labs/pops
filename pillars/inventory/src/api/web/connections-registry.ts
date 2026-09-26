import { and, eq, getTableColumns, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';

import { resolveProtocol1TypeById } from '../../catalogue/index.js';
import { fixtures, itemFixtureConnections, itemConnections, items } from '../../db/index.js';
import { ValidationError } from '../shared/errors.js';
import { decodeCursor, encodeCursor } from '../sync/cursor.js';

import type { WebConnectionsResponseSchema } from '../../contract/rest-web-connections.js';
import type { FixtureRow, ItemRow } from '../../db/index.js';
import type { CommandDb } from '../../domain/commands/index.js';

type WebConnectionsResponse = z.infer<typeof WebConnectionsResponseSchema>;
type ConnectionRow = WebConnectionsResponse['rows'][number];
type RawItemEnd = Pick<ItemRow, 'id' | 'name' | 'code' | 'typeId' | 'isContainer' | 'lifecycle'>;
type RawItemConnection = { id: number; createdAt: string; itemA: RawItemEnd; itemB: RawItemEnd };
type RawFixtureConnection = {
  id: number;
  createdAt: string;
  item: RawItemEnd;
  fixture: Pick<FixtureRow, 'id' | 'name' | 'type' | 'locationId'>;
};

const cursorSchema = z.object({
  v: z.literal(1),
  t: z.literal('web-connections'),
  kind: z.enum(['all', 'item', 'fixture']),
  q: z.string().nullable(),
  key: z.tuple([z.string(), z.string(), z.string()]),
});
type ConnectionsCursor = z.infer<typeof cursorSchema>;

const compareNoCase = (left: string, right: string): number => {
  const leftKey = left.toLowerCase();
  const rightKey = right.toLowerCase();
  return Number(leftKey > rightKey) - Number(leftKey < rightKey);
};

const compareId = (left: string, right: string): number =>
  Number(left > right) - Number(left < right);

const compareEnd = (left: RawItemEnd, right: RawItemEnd): number =>
  compareNoCase(left.name, right.name) || compareId(left.id, right.id);

function typeKeysFor(db: CommandDb, ends: readonly RawItemEnd[]): Map<string, string | null> {
  const keysByTypeId = new Map<string, string | null>();
  for (const end of ends) {
    if (end.typeId !== null && !keysByTypeId.has(end.typeId)) {
      keysByTypeId.set(end.typeId, resolveProtocol1TypeById(db, end.typeId)?.key ?? null);
    }
  }
  return new Map(
    ends.map((end) => [end.id, end.typeId === null ? null : (keysByTypeId.get(end.typeId) ?? null)])
  );
}

function toItemEnd(
  end: RawItemEnd,
  typeKeys: ReadonlyMap<string, string | null>
): ConnectionRow['item'] {
  return {
    kind: 'item',
    id: end.id,
    name: end.name,
    code: end.code,
    typeKey: typeKeys.get(end.id) ?? null,
    isContainer: end.isContainer === 1,
    lifecycle: end.lifecycle,
  };
}

function rowsFromConnections(
  db: CommandDb,
  itemRows: readonly RawItemConnection[],
  fixtureRows: readonly RawFixtureConnection[]
): ConnectionRow[] {
  const ends = [
    ...itemRows.flatMap((row) => [row.itemA, row.itemB]),
    ...fixtureRows.map((row) => row.item),
  ];
  const typeKeys = typeKeysFor(db, ends);
  return [
    ...itemRows.map((row) => {
      const [item, far] =
        compareEnd(row.itemA, row.itemB) <= 0 ? [row.itemA, row.itemB] : [row.itemB, row.itemA];
      return {
        id: `item:${row.id}`,
        createdAt: row.createdAt,
        item: toItemEnd(item, typeKeys),
        far: toItemEnd(far, typeKeys),
      };
    }),
    ...fixtureRows.map((row) => ({
      id: `fixture:${row.id}`,
      createdAt: row.createdAt,
      item: toItemEnd(row.item, typeKeys),
      far: {
        kind: 'fixture' as const,
        id: row.fixture.id,
        name: row.fixture.name,
        type: row.fixture.type,
        locationId: row.fixture.locationId,
      },
    })),
  ];
}

function readRows(db: CommandDb): ConnectionRow[] {
  const itemA = alias(items, 'item_a'),
    itemB = alias(items, 'item_b');
  const itemRows = db
    .select({
      id: itemConnections.id,
      createdAt: itemConnections.createdAt,
      itemA: getTableColumns(itemA),
      itemB: getTableColumns(itemB),
    })
    .from(itemConnections)
    .innerJoin(itemA, eq(itemConnections.itemAId, itemA.id))
    .innerJoin(itemB, eq(itemConnections.itemBId, itemB.id))
    .where(and(isNull(itemA.deletedAt), isNull(itemB.deletedAt)))
    .all();
  const fixtureRows = db
    .select({
      id: itemFixtureConnections.id,
      createdAt: itemFixtureConnections.createdAt,
      item: getTableColumns(items),
      fixture: getTableColumns(fixtures),
    })
    .from(itemFixtureConnections)
    .innerJoin(items, eq(itemFixtureConnections.itemId, items.id))
    .innerJoin(fixtures, eq(itemFixtureConnections.fixtureId, fixtures.id))
    .where(isNull(items.deletedAt))
    .all();
  return rowsFromConnections(db, itemRows, fixtureRows);
}

const compareRows = (left: ConnectionRow, right: ConnectionRow): number =>
  compareNoCase(left.item.name, right.item.name) ||
  compareNoCase(left.far.name, right.far.name) ||
  compareId(left.id, right.id);

const rowKey = (row: ConnectionRow): [string, string, string] => [
  row.item.name,
  row.far.name,
  row.id,
];

const compareRowToKey = (row: ConnectionRow, key: ConnectionsCursor['key']): number =>
  compareNoCase(row.item.name, key[0]) ||
  compareNoCase(row.far.name, key[1]) ||
  compareId(row.id, key[2]);

function cursorFor(
  raw: string | undefined,
  filter: { kind: ConnectionsCursor['kind']; q: string | null }
): ConnectionsCursor | null {
  if (raw === undefined) return null;
  try {
    const cursor = decodeCursor(cursorSchema, raw);
    if (cursor.kind !== filter.kind || cursor.q !== filter.q) throw new Error('cursor mismatch');
    return cursor;
  } catch {
    throw new ValidationError('The cursor was not issued by this route', { cursor: raw });
  }
}

function matches(row: ConnectionRow, kind: ConnectionsCursor['kind'], query: string): boolean {
  if (kind !== 'all' && row.far.kind !== kind) return false;
  const values = [row.item.name, row.item.code ?? '', row.far.name];
  if (row.far.kind === 'item') values.push(row.far.code ?? '');
  return values.some((value) => value.toLowerCase().includes(query));
}

function summaryFor(rows: readonly ConnectionRow[]): WebConnectionsResponse['summary'] {
  const itemIds = new Set<string>();
  const fixtureIds = new Set<string>();
  rows.forEach(({ item, far }) => {
    itemIds.add(item.id);
    (far.kind === 'item' ? itemIds : fixtureIds).add(far.id);
  });
  return { connections: rows.length, items: itemIds.size, fixtures: fixtureIds.size };
}

/** Read the resolved, filtered, cursor-paged web connection registry. */
export function readConnectionsPage(
  db: CommandDb,
  filter: { kind: 'all' | 'item' | 'fixture'; q?: string },
  request: { cursor?: string; limit: number }
): WebConnectionsResponse {
  const query = filter.q?.trim().toLowerCase() ?? '';
  const rows = readRows(db)
    .filter((row) => matches(row, filter.kind, query))
    .toSorted(compareRows);
  const summary = summaryFor(rows);
  const cursor = cursorFor(request.cursor, { kind: filter.kind, q: query === '' ? null : query });
  const pageRows =
    cursor === null ? rows : rows.filter((row) => compareRowToKey(row, cursor.key) > 0);
  const page = pageRows.slice(0, request.limit);
  const last = page.at(-1);
  return {
    rows: page,
    nextCursor:
      pageRows.length > request.limit && last
        ? encodeCursor({
            v: 1,
            t: 'web-connections',
            kind: filter.kind,
            q: query === '' ? null : query,
            key: rowKey(last),
          })
        : null,
    summary,
  };
}
