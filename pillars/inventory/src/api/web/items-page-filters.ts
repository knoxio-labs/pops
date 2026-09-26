/** SQL predicates and counts shared by the web item page reader. */
import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm';

import { resolvePublishedType } from '../../catalogue/index.js';
import { catalogueRevisions, itemTypes, items } from '../../db/index.js';
import { atEffectiveLocationSql, withinSql } from './placement-scope.js';

import type { WEB_LIFECYCLES, WEB_PLACEMENT_KINDS } from '../../contract/rest-web.js';
import type { CommandDb } from '../../domain/commands/index.js';

/** The filters `GET /web/items` accepts, already parsed off the query string. */
export interface WebItemsFilter {
  readonly typeKey?: string;
  readonly placementKind?: (typeof WEB_PLACEMENT_KINDS)[number];
  readonly locationId?: string;
  readonly containingItemId?: string;
  /** Only these item ids; an empty list matches nothing. */
  readonly ids?: readonly string[];
  /** Active items only when falsy (ADR-002: excluded from listings unless asked for). */
  readonly includeInactive?: boolean;
  /** Case-insensitive text matching across the web catalogue's approved fields. */
  readonly q?: string;
  readonly untyped?: boolean;
  readonly isContainer?: boolean;
  readonly access?: 'open' | 'closed';
  readonly isFull?: boolean;
  readonly lifecycle?: (typeof WEB_LIFECYCLES)[number];
  readonly legacyLabelOf?: string;
  readonly within?: string;
  readonly effectiveLocationId?: string;
}

/** SQL predicates used to filter and rank one web item text query. */
export interface WebItemsTextSearch {
  readonly match: SQL;
  readonly rank: SQL<number>;
}

function andConditions(conditions: readonly SQL[]): SQL {
  return and(...conditions) ?? sql`1`;
}

function orConditions(conditions: readonly SQL[]): SQL {
  return or(...conditions) ?? sql`0`;
}

function strictBooleanCondition(column: SQLWrapper, value: boolean): SQL {
  return value ? sql`${column} = 1` : sql`(${column} IS NULL OR ${column} = 0)`;
}

function typeConditions(db: CommandDb, filter: WebItemsFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.typeKey !== undefined) {
    const type = resolvePublishedType(db, { key: filter.typeKey });
    conditions.push(type === null ? sql`0` : eq(items.typeId, type.id));
  }
  if (filter.untyped !== undefined) {
    conditions.push(filter.untyped ? isNull(items.typeId) : isNotNull(items.typeId));
  }
  return conditions;
}

function placementConditions(filter: WebItemsFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.placementKind !== undefined) {
    conditions.push(eq(items.placementKind, filter.placementKind));
  }
  if (filter.locationId !== undefined) conditions.push(eq(items.locationId, filter.locationId));
  if (filter.containingItemId !== undefined) {
    conditions.push(eq(items.containingItemId, filter.containingItemId));
  }
  if (filter.ids !== undefined) conditions.push(inArray(items.id, [...filter.ids]));
  return conditions;
}

function containerConditions(filter: WebItemsFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.isContainer !== undefined) {
    conditions.push(eq(items.isContainer, filter.isContainer ? 1 : 0));
  }
  if (filter.access !== undefined) conditions.push(eq(items.access, filter.access));
  if (filter.isFull !== undefined) {
    conditions.push(strictBooleanCondition(items.isFull, filter.isFull));
  }
  return conditions;
}

function legacyLabelCondition(db: CommandDb, typeKey: string): SQL[] {
  const type = resolvePublishedType(db, { key: typeKey });
  if (type === null) return [sql`0`];

  const labels = [
    ...new Set(
      type.legacyLabels
        .map((label) => label.trim().toLowerCase())
        .filter((label) => label.length > 0)
    ),
  ];
  if (labels.length === 0) return [sql`0`];

  return [
    isNull(items.typeId),
    eq(items.lifecycle, 'active'),
    orConditions(labels.map((label) => sql`lower(trim(${items.legacyType})) = ${label}`)),
  ];
}

function locationConditions(db: CommandDb, filter: WebItemsFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.legacyLabelOf !== undefined) {
    conditions.push(...legacyLabelCondition(db, filter.legacyLabelOf));
  }
  if (filter.within !== undefined) conditions.push(withinSql(db, filter.within) ?? sql`0`);
  if (filter.effectiveLocationId !== undefined) {
    conditions.push(atEffectiveLocationSql(filter.effectiveLocationId));
  }
  return conditions;
}

function lifecycleConditions(filter: WebItemsFilter): SQL[] {
  if (filter.lifecycle !== undefined) return [eq(items.lifecycle, filter.lifecycle)];
  return filter.includeInactive === true ? [] : [eq(items.lifecycle, 'active')];
}

/** Build every filter predicate for one web item list request. */
export function matchConditions(db: CommandDb, filter: WebItemsFilter): SQL[] {
  return [
    isNull(items.deletedAt),
    ...typeConditions(db, filter),
    ...placementConditions(filter),
    ...containerConditions(filter),
    ...locationConditions(db, filter),
    ...lifecycleConditions(filter),
  ];
}

/** Build the filters used by the web list's unfiltered baseline count. */
export function unfilteredConditions(filter: WebItemsFilter): SQL[] {
  return [isNull(items.deletedAt), ...containerConditions(filter), ...lifecycleConditions(filter)];
}

/** Build the filters used to count inactive rows hidden by the default view. */
export function hiddenInactiveConditions(db: CommandDb, filter: WebItemsFilter): SQL[] {
  return [
    isNull(items.deletedAt),
    ...typeConditions(db, filter),
    ...placementConditions(filter),
    ...containerConditions(filter),
    ...locationConditions(db, filter),
  ];
}

/** Count rows matching a SQL predicate list in the caller's read transaction. */
export function countRows(db: CommandDb, conditions: readonly SQL[]): number {
  const row = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(items)
    .where(andConditions(conditions))
    .get();
  return row?.count ?? 0;
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

function like(expression: SQLWrapper, pattern: string): SQL {
  return sql`lower(${expression}) LIKE lower(${pattern}) ESCAPE '\\'`;
}

function publishedTypeLabelSql(): SQL<string | null> {
  return sql<string | null>`(
    SELECT ${itemTypes.label}
    FROM ${itemTypes}
    WHERE ${itemTypes.revision} = (
      SELECT MAX(${catalogueRevisions.revision})
      FROM ${catalogueRevisions}
      WHERE ${catalogueRevisions.status} = 'published'
    )
      AND ${itemTypes.id} = ${items.typeId}
    LIMIT 1
  )`;
}

/** Build the case-insensitive match and tier expressions for `q`. */
export function textSearchFor(q: string): WebItemsTextSearch {
  const escaped = escapeLike(q);
  const prefix = like(items.name, `${escaped}%`);
  const contains = like(items.name, `%${escaped}%`);
  const wordPrefix = orConditions(
    [' ', '\t', '\n', '\r', '\v', '\f'].map((separator) =>
      like(items.name, `%${separator}${escaped}%`)
    )
  );
  const nameTier = orConditions([prefix, wordPrefix]);
  const otherTier = orConditions([
    like(items.code, `%${escaped}%`),
    like(items.note, `%${escaped}%`),
    like(publishedTypeLabelSql(), `%${escaped}%`),
  ]);
  return {
    match: orConditions([nameTier, contains, otherTier]),
    rank: sql<number>`CASE
      WHEN ${nameTier} THEN 3
      WHEN ${contains} THEN 2
      WHEN ${otherTier} THEN 1
      ELSE 0
    END`,
  };
}
