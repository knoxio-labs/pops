/** SQL order descriptors for the sorted web item list. */
import { asc, sql, type SQL, type SQLWrapper } from 'drizzle-orm';

import { catalogueRevisions, itemTypes, items, locations } from '../../db/index.js';
import { effectiveLocationIdSql } from './placement-scope.js';

import type { WebItemsSort } from '../../contract/rest-web.js';

export interface SortKeySpec {
  readonly expression: SQLWrapper;
  readonly direction: 'asc' | 'desc';
  readonly nullsLast: boolean;
  readonly caseInsensitive: boolean;
}

export interface SortDescriptor {
  readonly orderBy: readonly SQL[];
  readonly keys: readonly SortKeySpec[];
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

function effectiveLocationNameSql(effectiveLocation: SQL<string | null>): SQL<string | null> {
  return sql<string | null>`(
    SELECT ${locations.name}
    FROM ${locations}
    WHERE ${locations.id} = ${effectiveLocation}
    LIMIT 1
  )`;
}

function packingRankSql(): SQL<number> {
  return sql<number>`CASE
    WHEN ${items.access} = 'closed' THEN 2
    WHEN ${items.isContainer} = 1 AND ${items.isFull} = 1 THEN 1
    ELSE 0
  END`;
}

function nameDescriptor(): SortDescriptor {
  const name = sql`${items.name} COLLATE NOCASE`;
  return {
    orderBy: [asc(name), asc(items.id)],
    keys: [{ expression: items.name, direction: 'asc', nullsLast: false, caseInsensitive: true }],
  };
}

function updatedDescriptor(): SortDescriptor {
  return {
    orderBy: [sql`${items.updatedAt} DESC`, asc(items.id)],
    keys: [
      {
        expression: items.updatedAt,
        direction: 'desc',
        nullsLast: false,
        caseInsensitive: false,
      },
    ],
  };
}

function typeDescriptor(): SortDescriptor {
  const typeLabel = publishedTypeLabelSql();
  const typeLabelNoCase = sql`${typeLabel} COLLATE NOCASE`;
  const name = sql`${items.name} COLLATE NOCASE`;
  return {
    orderBy: [sql`${typeLabel} IS NULL`, asc(typeLabelNoCase), asc(name), asc(items.id)],
    keys: [
      { expression: typeLabel, direction: 'asc', nullsLast: true, caseInsensitive: true },
      { expression: items.name, direction: 'asc', nullsLast: false, caseInsensitive: true },
    ],
  };
}

function whereDescriptor(): SortDescriptor {
  const effectiveLocation = effectiveLocationIdSql();
  const locationName = effectiveLocationNameSql(effectiveLocation);
  const locationNameNoCase = sql`${locationName} COLLATE NOCASE`;
  const name = sql`${items.name} COLLATE NOCASE`;
  return {
    orderBy: [
      sql`${effectiveLocation} IS NULL`,
      asc(locationNameNoCase),
      asc(effectiveLocation),
      asc(name),
      asc(items.id),
    ],
    keys: [
      { expression: locationName, direction: 'asc', nullsLast: true, caseInsensitive: true },
      { expression: effectiveLocation, direction: 'asc', nullsLast: true, caseInsensitive: false },
      { expression: items.name, direction: 'asc', nullsLast: false, caseInsensitive: true },
    ],
  };
}

function packingDescriptor(): SortDescriptor {
  const packingRank = packingRankSql();
  const name = sql`${items.name} COLLATE NOCASE`;
  return {
    orderBy: [asc(packingRank), asc(name), asc(items.id)],
    keys: [
      { expression: packingRank, direction: 'asc', nullsLast: false, caseInsensitive: false },
      { expression: items.name, direction: 'asc', nullsLast: false, caseInsensitive: true },
    ],
  };
}

/** Create the SQL order and key metadata for a supported web item sort. */
export function sortDescriptor(sort: WebItemsSort): SortDescriptor {
  switch (sort) {
    case 'name':
      return nameDescriptor();
    case 'updated':
      return updatedDescriptor();
    case 'type':
      return typeDescriptor();
    case 'where':
      return whereDescriptor();
    case 'packing':
      return packingDescriptor();
  }
}
