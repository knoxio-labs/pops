/**
 * House fixtures and the edges that wire items to them. A fixture is part of
 * the building (an outlet, a light fitting, a network port): it has a room
 * but no placement, never moves with the items wired to it, and is not an
 * item. Items connect to each other and to fixtures through one edge list.
 */
import { isLocationWithin } from '@/kit/inventory/foundation';

import type { ItemRowModel, PlacementWorld } from '@/kit/inventory/foundation';

/** What a fixture is, for its icon and the kind filter. */
export type FixtureKind = 'power' | 'light' | 'switch' | 'network' | 'antenna' | 'water';

/** One house fixture. */
export interface FixtureModel {
  id: string;
  name: string;
  kind: FixtureKind;
  /** The room or place it is built into. */
  locationId: string;
  note: string | null;
  addedAt: string;
}

/** The far end of a connection: another item or a fixture. */
export type ConnectionEnd =
  | { kind: 'item'; itemId: string }
  | { kind: 'fixture'; fixtureId: string };

/** One edge. `itemId` is always an item; `to` is an item or a fixture. */
export interface ConnectionModel {
  id: string;
  itemId: string;
  to: ConnectionEnd;
  createdAt: string;
}

/** A fixture as its list row reads it. */
export interface FixtureRow {
  fixture: FixtureModel;
  wired: readonly ItemRowModel[];
}

/** Fixture list filters: a query over names, one kind, one room. */
export interface FixtureFilter {
  query: string;
  kind: FixtureKind | 'all';
  locationId: string | null;
}

/** No filter at all. */
export const NO_FIXTURE_FILTER: FixtureFilter = { query: '', kind: 'all', locationId: null };

/** Items wired to one fixture, in name order; ids the world no longer knows are skipped. */
export function wiredItems(
  fixtureId: string,
  connections: readonly ConnectionModel[],
  world: PlacementWorld
): ItemRowModel[] {
  const ids = connections
    .filter((edge) => edge.to.kind === 'fixture' && edge.to.fixtureId === fixtureId)
    .map((edge) => edge.itemId);
  return [...new Set(ids)]
    .flatMap((id) => {
      const found = world.items.get(id);
      return found === undefined ? [] : [found];
    })
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

/** Every fixture with what is wired to it, sorted by room path then name. */
export function fixtureRows(
  fixtures: readonly FixtureModel[],
  connections: readonly ConnectionModel[],
  world: PlacementWorld
): FixtureRow[] {
  return fixtures
    .map((fixture) => ({ fixture, wired: wiredItems(fixture.id, connections, world) }))
    .toSorted((a, b) => {
      const room = roomName(a.fixture, world).localeCompare(roomName(b.fixture, world));
      return room === 0 ? a.fixture.name.localeCompare(b.fixture.name) : room;
    });
}

function roomName(fixture: FixtureModel, world: PlacementWorld): string {
  return world.locations.get(fixture.locationId)?.name ?? '';
}

/**
 * The rows a filter keeps. The query matches the fixture's name, its note or
 * the name of anything wired to it, case-insensitively; a location keeps
 * fixtures in that place or anywhere beneath it.
 */
export function filterFixtures(
  rows: readonly FixtureRow[],
  filter: FixtureFilter,
  world: PlacementWorld
): FixtureRow[] {
  const query = filter.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.kind !== 'all' && row.fixture.kind !== filter.kind) return false;
    if (
      filter.locationId !== null &&
      !isLocationWithin(world, row.fixture.locationId, filter.locationId)
    ) {
      return false;
    }
    if (query === '') return true;
    const haystack = [row.fixture.name, row.fixture.note ?? '', ...row.wired.map((i) => i.name)];
    return haystack.some((text) => text.toLowerCase().includes(query));
  });
}

/** Whether any filter narrows the list. */
export function isFiltered(filter: FixtureFilter): boolean {
  return filter.query.trim() !== '' || filter.kind !== 'all' || filter.locationId !== null;
}
