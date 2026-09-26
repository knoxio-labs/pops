/** Query and rank the inventory web search surface. */
import { and, asc, desc, eq, getTableColumns, gt, isNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { resolvePublishedType } from '../../catalogue/index.js';
import {
  catalogueRevisions,
  itemTypes,
  items,
  locations,
  type ItemRow,
  type LocationRow,
} from '../../db/index.js';
import { MAX_CONTAINMENT_DEPTH } from '../../domain/commands/index.js';
import { ValidationError } from '../shared/errors.js';
import { decodeCursor, encodeCursor } from '../sync/cursor.js';
import { countRows } from './items-page-filters.js';
import { withinSql } from './placement-scope.js';

import type { SQL, SQLWrapper } from 'drizzle-orm';

import type { CommandDb } from '../../domain/commands/index.js';

const cursorSchema = z.object({
  v: z.literal(1),
  t: z.literal('web-search'),
  q: z.string(),
  activeOnly: z.boolean(),
  typeKey: z.string().nullable(),
  within: z.string().nullable(),
  key: z.tuple([z.number().int().min(1).max(4), z.union([z.literal(0), z.literal(1)]), z.string()]),
  after: z.string(),
});
type SearchCursor = z.infer<typeof cursorSchema>;
type WebSearchTier = 'prefix' | 'contains' | 'other';
type WebSearchField = 'code' | 'note' | 'type' | 'place';
type WebSearchQuery = Pick<SearchCursor, 'q' | 'activeOnly' | 'typeKey' | 'within'> & {
  readonly cursor?: string;
  readonly limit: number;
};
type WebSearchItemHit = { row: ItemRow; tier: WebSearchTier; field: WebSearchField | null } & {
  rank: number;
};
type WebSearchPlaceHit = { row: LocationRow; tier: 'prefix' | 'contains' };
type WebSearchPage = Record<'exact', ItemRow | null> &
  Record<'items', WebSearchItemHit[]> &
  Record<'places', WebSearchPlaceHit[]> &
  Record<'nextCursor', string | null> &
  Record<'total', number>;
const WORD_SEPARATORS = [' ', '\t', '\n', '\r', '\v', '\f'];

const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/gu, (character) => `\\${character}`);
const anyOf = (conditions: readonly SQL[]): SQL => or(...conditions) ?? sql`0`;
const like = (expression: SQLWrapper, pattern: string): SQL =>
  sql`lower(${expression}) LIKE lower(${pattern}) ESCAPE '\\'`;
const wordPrefix = (expression: SQLWrapper, escaped: string): SQL =>
  anyOf(WORD_SEPARATORS.map((separator) => like(expression, `%${separator}${escaped}%`)));
const publishedTypeLabelSql = (): SQL<string | null> =>
  sql<
    string | null
  >`(SELECT ${itemTypes.label} FROM ${itemTypes} WHERE ${itemTypes.revision} = (SELECT MAX(${catalogueRevisions.revision}) FROM ${catalogueRevisions} WHERE ${catalogueRevisions.status} = 'published') AND ${itemTypes.id} = ${items.typeId} LIMIT 1)`;
const placePathMatch = (pattern: string): SQL =>
  sql`EXISTS (WITH RECURSIVE placement(id, location_id, containing_item_id, depth) AS (SELECT ${items.id}, ${items.locationId}, ${items.containingItemId}, 0 UNION ALL SELECT parent.id, parent.location_id, parent.containing_item_id, placement.depth + 1 FROM items AS parent JOIN placement ON parent.id = placement.containing_item_id WHERE placement.depth < ${MAX_CONTAINMENT_DEPTH} AND parent.deleted_at IS NULL), place_path(id, name, parent_id, depth) AS (SELECT place.id, place.name, place.parent_id, 0 FROM locations AS place JOIN placement ON place.id = placement.location_id WHERE place.deleted_at IS NULL UNION ALL SELECT parent.id, parent.name, parent.parent_id, place_path.depth + 1 FROM locations AS parent JOIN place_path ON parent.id = place_path.parent_id WHERE parent.deleted_at IS NULL AND place_path.depth < ${MAX_CONTAINMENT_DEPTH}) SELECT 1 FROM place_path WHERE lower(place_path.name) LIKE lower(${pattern}) ESCAPE '\\')`;

type SearchExpressions = Record<'match', SQL> &
  Record<'rank', SQL<number>> &
  Record<'field', SQL<WebSearchField | null>>;

function searchExpressions(q: string): SearchExpressions {
  const escaped = escapeLike(q);
  const namePrefix = anyOf([like(items.name, `${escaped}%`), wordPrefix(items.name, escaped)]);
  const nameContains = like(items.name, `%${escaped}%`);
  const code = like(items.code, `%${escaped}%`);
  const note = like(items.note, `%${escaped}%`);
  const type = like(publishedTypeLabelSql(), `%${escaped}%`);
  const place = placePathMatch(`%${escaped}%`);
  const other = anyOf([code, note, type, place]);
  return {
    match: anyOf([namePrefix, nameContains, other]),
    rank: sql<number>`CASE WHEN ${like(items.name, `${escaped}%`)} THEN 4 WHEN ${namePrefix} THEN 3 WHEN ${nameContains} THEN 2 WHEN ${other} THEN 1 ELSE 0 END`,
    field: sql<WebSearchField | null>`CASE WHEN ${namePrefix} OR ${nameContains} THEN NULL WHEN ${code} THEN 'code' WHEN ${note} THEN 'note' WHEN ${type} THEN 'type' WHEN ${place} THEN 'place' ELSE NULL END`,
  };
}

function baseConditions(db: CommandDb, query: WebSearchQuery): SQL[] {
  const conditions: SQL[] = [isNull(items.deletedAt)];
  if (query.activeOnly) conditions.push(eq(items.lifecycle, 'active'));
  if (query.typeKey !== null) {
    const type = resolvePublishedType(db, { key: query.typeKey });
    conditions.push(type === null ? sql`0` : eq(items.typeId, type.id));
  }
  if (query.within !== null) conditions.push(withinSql(db, query.within) ?? sql`0`);
  return conditions;
}

function cursorFor(raw: string | undefined, query: WebSearchQuery): SearchCursor | null {
  if (raw === undefined) return null;
  try {
    const cursor = decodeCursor(cursorSchema, raw);
    const sameQuery =
      cursor.q !== query.q ||
      cursor.activeOnly !== query.activeOnly ||
      cursor.typeKey !== query.typeKey ||
      cursor.within !== query.within;
    if (sameQuery) {
      throw new Error('cursor query mismatch');
    }
    return cursor;
  } catch {
    throw new ValidationError('The cursor was not issued by this route', { cursor: raw });
  }
}

type CursorArgs = [cursor: SearchCursor | null, rank: SQL<number>, active: SQL<number>];

function afterCursor(...[cursor, rank, active]: CursorArgs): SQL | undefined {
  if (cursor === null) return undefined;
  const [tier, activeValue, name] = cursor.key;
  const sameRank = eq(rank, tier);
  const sameActive = eq(active, activeValue);
  const nameKey = sql`${items.name} COLLATE NOCASE`;
  return anyOf([
    sql`${rank} < ${tier}`,
    and(sameRank, sql`${active} > ${activeValue}`) ?? sql`0`,
    and(sameRank, sameActive, sql`${nameKey} > ${name}`) ?? sql`0`,
    and(sameRank, sameActive, sql`${nameKey} = ${name}`, gt(items.id, cursor.after)) ?? sql`0`,
  ]);
}

function tierFor(value: number): WebSearchTier {
  if (value === 4 || value === 3) return 'prefix';
  if (value === 2) return 'contains';
  if (value === 1) return 'other';
  throw new Error(`unexpected web search tier ${String(value)}`);
}

function placeHits(db: CommandDb, q: string, typeKey: string | null): WebSearchPlaceHit[] {
  if (typeKey !== null) return [];
  const escaped = escapeLike(q);
  const prefix = anyOf([like(locations.name, `${escaped}%`), wordPrefix(locations.name, escaped)]);
  const tier = sql<'prefix' | 'contains'>`CASE WHEN ${prefix} THEN 'prefix' ELSE 'contains' END`;
  const rows = db
    .select({ ...getTableColumns(locations), tier })
    .from(locations)
    .where(and(isNull(locations.deletedAt), like(locations.name, `%${escaped}%`)))
    .orderBy(
      desc(sql`CASE WHEN ${prefix} THEN 1 ELSE 0 END`),
      asc(sql`${locations.name} COLLATE NOCASE`),
      asc(locations.id)
    )
    .all();
  return rows.map(({ tier: rowTier, ...row }) => ({ row, tier: rowTier }));
}

function nextCursor(query: WebSearchQuery, hit: WebSearchItemHit): string {
  return encodeCursor({
    v: 1,
    t: 'web-search',
    q: query.q,
    activeOnly: query.activeOnly,
    typeKey: query.typeKey ?? null,
    within: query.within ?? null,
    key: [hit.rank, hit.row.lifecycle === 'active' ? 0 : 1, hit.row.name],
    after: hit.row.id,
  });
}

/** Read one ranked, filtered page of live web-search results. */
export function readWebSearchPage(db: CommandDb, query: WebSearchQuery): WebSearchPage {
  const conditions = baseConditions(db, query);
  const expressions = searchExpressions(query.q);
  const exact =
    db
      .select()
      .from(items)
      .where(and(isNull(items.deletedAt), sql`lower(${items.code}) = lower(${query.q})`))
      .get() ?? null;
  const total =
    countRows(
      db,
      [...conditions, expressions.match].concat(exact ? [ne(items.id, exact.id)] : [])
    ) + Number(exact !== null);
  const active = sql<number>`CASE WHEN ${items.lifecycle} = 'active' THEN 0 ELSE 1 END`;
  const itemWhere = and(
    ...conditions,
    expressions.match,
    exact ? ne(items.id, exact.id) : undefined,
    afterCursor(cursorFor(query.cursor, query), expressions.rank, active)
  );
  const itemRows = db
    .select({ ...getTableColumns(items), tier: expressions.rank, field: expressions.field })
    .from(items)
    .where(itemWhere)
    .orderBy(
      desc(expressions.rank),
      asc(active),
      asc(sql`${items.name} COLLATE NOCASE`),
      asc(items.id)
    )
    .limit(query.limit + 1)
    .all();
  const hits = itemRows.slice(0, query.limit).map(({ tier, field, ...row }) => ({
    row,
    tier: tierFor(tier),
    field,
    rank: tier,
  }));
  const last = hits.at(-1);
  return {
    exact: query.cursor === undefined ? exact : null,
    items: hits,
    places: query.cursor === undefined ? placeHits(db, query.q, query.typeKey) : [],
    nextCursor: itemRows.length > query.limit && last ? nextCursor(query, last) : null,
    total,
  };
}
