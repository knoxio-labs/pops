/** Query and rank the inventory web search surface. */
import { and, asc, desc, eq, getTableColumns, isNull, ne, or, sql } from 'drizzle-orm';

import { resolvePublishedType } from '../../catalogue/index.js';
import { catalogueRevisions, itemTypes, items, type ItemRow } from '../../db/index.js';
import { MAX_CONTAINMENT_DEPTH } from '../../domain/commands/index.js';
import { countRows } from './items-page-filters.js';
import { withinSql } from './placement-scope.js';
import {
  readWebSearchCursor,
  webSearchAfterCursor,
  webSearchNextCursor,
  type WebSearchCursorQuery,
  type WebSearchTier,
} from './search-cursor.js';
import { readWebSearchPlaces, type WebSearchPlaceHit } from './search-places.js';

import type { SQL, SQLWrapper } from 'drizzle-orm';

import type { CommandDb } from '../../domain/commands/index.js';

type WebSearchField = 'code' | 'note' | 'type' | 'place';
type WebSearchQuery = {
  readonly q: string;
  readonly activeOnly?: boolean;
  readonly typeKey?: string;
  readonly within?: string;
};
type NormalizedWebSearchQuery = WebSearchCursorQuery;
type WebSearchRequest = {
  readonly cursor?: string;
  readonly limit: number;
};
type WebSearchItemHit = { row: ItemRow; tier: WebSearchTier; field: WebSearchField | null };
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
    rank: sql<number>`CASE WHEN ${namePrefix} THEN 3 WHEN ${nameContains} THEN 2 WHEN ${other} THEN 1 ELSE 0 END`,
    field: sql<WebSearchField | null>`CASE WHEN ${namePrefix} OR ${nameContains} THEN NULL WHEN ${code} THEN 'code' WHEN ${note} THEN 'note' WHEN ${type} THEN 'type' WHEN ${place} THEN 'place' ELSE NULL END`,
  };
}

function normalizeQuery(query: WebSearchQuery): NormalizedWebSearchQuery {
  return {
    q: query.q,
    activeOnly: query.activeOnly === true,
    typeKey: query.typeKey ?? null,
    within: query.within ?? null,
  };
}

function baseConditions(db: CommandDb, query: NormalizedWebSearchQuery): SQL[] {
  const conditions: SQL[] = [isNull(items.deletedAt)];
  if (query.activeOnly) conditions.push(eq(items.lifecycle, 'active'));
  if (query.typeKey !== null) {
    const type = resolvePublishedType(db, { key: query.typeKey });
    conditions.push(type === null ? sql`0` : eq(items.typeId, type.id));
  }
  if (query.within !== null) conditions.push(withinSql(db, query.within) ?? sql`0`);
  return conditions;
}

function tierFor(value: number): WebSearchTier {
  if (value === 3) return 'prefix';
  if (value === 2) return 'contains';
  if (value === 1) return 'other';
  throw new Error(`unexpected web search tier ${String(value)}`);
}

function readExactCode(db: CommandDb, q: string, activeOnly: boolean): ItemRow | null {
  const conditions: SQL[] = [isNull(items.deletedAt)];
  if (activeOnly) conditions.push(eq(items.lifecycle, 'active'));
  return (
    db
      .select()
      .from(items)
      .where(and(...conditions, sql`lower(${items.code}) = lower(${q})`))
      .get() ?? null
  );
}

function readItemPage(
  db: CommandDb,
  {
    conditions,
    expressions,
    exact,
    query,
    request,
  }: {
    readonly conditions: readonly SQL[];
    readonly expressions: SearchExpressions;
    readonly exact: ItemRow | null;
    readonly query: NormalizedWebSearchQuery;
    readonly request: WebSearchRequest;
  }
): { hits: WebSearchItemHit[]; nextCursor: string | null } {
  const active = sql<number>`CASE WHEN ${items.lifecycle} = 'active' THEN 0 ELSE 1 END`;
  const itemWhere = and(
    ...conditions,
    expressions.match,
    exact ? ne(items.id, exact.id) : undefined,
    webSearchAfterCursor(readWebSearchCursor(request.cursor, query), expressions.rank, active)
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
    .limit(request.limit + 1)
    .all();
  const hits = itemRows.slice(0, request.limit).map(({ tier, field, ...row }) => ({
    row,
    tier: tierFor(tier),
    field,
  }));
  const last = hits.at(-1);
  return {
    hits,
    nextCursor:
      itemRows.length > request.limit && last
        ? webSearchNextCursor(query, { ...last.row, tier: last.tier })
        : null,
  };
}

/** Read one ranked, filtered page of live web-search results. */
export function readWebSearchPage(
  db: CommandDb,
  query: WebSearchQuery,
  request: WebSearchRequest
): WebSearchPage {
  const normalizedQuery = normalizeQuery(query);
  const conditions = baseConditions(db, normalizedQuery);
  const expressions = searchExpressions(normalizedQuery.q);
  const places = readWebSearchPlaces(db, normalizedQuery.q, normalizedQuery.typeKey);
  const exact = readExactCode(db, normalizedQuery.q, normalizedQuery.activeOnly);
  const total =
    countRows(
      db,
      [...conditions, expressions.match].concat(exact ? [ne(items.id, exact.id)] : [])
    ) +
    Number(exact !== null) +
    places.length;
  const page = readItemPage(db, {
    conditions,
    expressions,
    exact,
    query: normalizedQuery,
    request,
  });
  return {
    exact: request.cursor === undefined ? exact : null,
    items: page.hits,
    places: request.cursor === undefined ? places : [],
    nextCursor: page.nextCursor,
    total,
  };
}
