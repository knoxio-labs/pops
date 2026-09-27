import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';

import {
  fixtures,
  items,
  locations,
  locationsService,
  type InventoryDb,
  itemFixtureConnections,
} from '../../../db/index.js';

import type { FixtureListRow } from './types.js';

/** Paged fixture rows with the total number of rows matching the filters. */
export interface FixtureListResult {
  rows: FixtureListRow[];
  total: number;
}

function escapeSearch(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

function findMatchingFixtureIds(db: InventoryDb, search: string): string[] {
  const pattern = `%${escapeSearch(search)}%`;
  const fixtureIds = db
    .select({ id: fixtures.id })
    .from(fixtures)
    .where(
      sql`lower(${fixtures.name}) LIKE lower(${pattern}) ESCAPE '\\'
        OR lower(coalesce(${fixtures.notes}, '')) LIKE lower(${pattern}) ESCAPE '\\'`
    )
    .all()
    .map(({ id }) => id);
  const wiredFixtureIds = db
    .select({ fixtureId: itemFixtureConnections.fixtureId })
    .from(itemFixtureConnections)
    .innerJoin(items, eq(itemFixtureConnections.itemId, items.id))
    .where(
      and(isNull(items.deletedAt), sql`lower(${items.name}) LIKE lower(${pattern}) ESCAPE '\\'`)
    )
    .all()
    .map(({ fixtureId }) => fixtureId);
  return [...new Set([...fixtureIds, ...wiredFixtureIds])];
}

function loadWiredNames(db: InventoryDb, fixtureIds: string[]): Map<string, string[]> {
  const wiredNamesByFixture = new Map<string, string[]>();
  if (fixtureIds.length === 0) return wiredNamesByFixture;

  const wiredRows = db
    .select({ fixtureId: itemFixtureConnections.fixtureId, name: items.name })
    .from(itemFixtureConnections)
    .innerJoin(items, eq(itemFixtureConnections.itemId, items.id))
    .where(and(inArray(itemFixtureConnections.fixtureId, fixtureIds), isNull(items.deletedAt)))
    .orderBy(
      asc(itemFixtureConnections.fixtureId),
      asc(sql`lower(${items.name})`),
      asc(items.name),
      asc(items.id)
    )
    .all();
  for (const wiredRow of wiredRows) {
    const names = wiredNamesByFixture.get(wiredRow.fixtureId);
    if (names) names.push(wiredRow.name);
    else wiredNamesByFixture.set(wiredRow.fixtureId, [wiredRow.name]);
  }
  return wiredNamesByFixture;
}

/** List fixtures with filters, stable room/name ordering, and live wiring summaries. */
export function listFixtures(
  db: InventoryDb,
  opts: {
    search?: string;
    withinLocationId?: string;
    locationId?: string;
    type?: string;
    limit: number;
    offset: number;
  }
): FixtureListResult {
  const conditions = [];
  const search = opts.search?.trim();
  if (search !== undefined && search.length > 0) {
    const matchingFixtureIds = findMatchingFixtureIds(db, search);
    if (matchingFixtureIds.length === 0) return { rows: [], total: 0 };
    conditions.push(inArray(fixtures.id, matchingFixtureIds));
  }
  if (opts.withinLocationId) {
    const locationIds = [
      opts.withinLocationId,
      ...locationsService.getDescendantLocationIds(db, opts.withinLocationId),
    ];
    conditions.push(inArray(fixtures.locationId, locationIds));
  } else if (opts.locationId) {
    conditions.push(eq(fixtures.locationId, opts.locationId));
  }
  if (opts.type) conditions.push(eq(fixtures.type, opts.type));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const fixtureRows = db
    .select({ fixture: fixtures })
    .from(fixtures)
    .leftJoin(locations, eq(fixtures.locationId, locations.id))
    .where(where)
    .orderBy(
      asc(sql`coalesce(lower(${locations.name}), '')`),
      asc(sql`lower(${fixtures.name})`),
      asc(fixtures.name),
      asc(fixtures.id)
    )
    .limit(opts.limit)
    .offset(opts.offset)
    .all()
    .map(({ fixture }) => fixture);
  const [countResult] = db.select({ total: count() }).from(fixtures).where(where).all();
  const wiredNamesByFixture = loadWiredNames(
    db,
    fixtureRows.map(({ id }) => id)
  );
  const rows = fixtureRows.map((fixture) => {
    const wiredNames = wiredNamesByFixture.get(fixture.id) ?? [];
    return { ...fixture, wiredCount: wiredNames.length, wiredNames };
  });
  return { rows, total: countResult?.total ?? 0 };
}
