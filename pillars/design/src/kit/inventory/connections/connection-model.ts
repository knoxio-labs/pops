import type {
  ConnectionEnd,
  ConnectionModel,
  FixtureModel,
} from '@/kit/inventory/fixtures/fixture-model';
/**
 * The connection registry as data: resolved rows, the list filter, the
 * chain a trace walks, the graph's nodes and edges, and the verdict on a
 * connection someone is about to make. Item to item edges are followed
 * transitively; a fixture is where a chain ends, because two things plugged
 * into one outlet are not connected to each other.
 */
import type { ItemRowModel, PlacementWorld } from '@/kit/inventory/foundation';

/** A connection end, resolved. */
export type ResolvedEnd =
  | { kind: 'item'; item: ItemRowModel }
  | { kind: 'fixture'; fixture: FixtureModel };

/** One registry row. */
export interface ConnectionRow {
  edge: ConnectionModel;
  item: ItemRowModel;
  far: ResolvedEnd;
}

/** Which edges the list shows. */
export type ConnectionKindFilter = 'all' | 'item' | 'fixture';

/** The registry's lookups: the item world and the fixtures by id. */
export interface ConnectionIndex {
  world: PlacementWorld;
  fixtures: ReadonlyMap<string, FixtureModel>;
}

/** Builds the lookup a model function needs. */
export function connectionIndex(
  world: PlacementWorld,
  fixtures: readonly FixtureModel[]
): ConnectionIndex {
  return { world, fixtures: new Map(fixtures.map((fixture) => [fixture.id, fixture])) };
}

function resolveEnd(end: ConnectionEnd, index: ConnectionIndex): ResolvedEnd | null {
  if (end.kind === 'item') {
    const item = index.world.items.get(end.itemId);
    return item === undefined ? null : { kind: 'item', item };
  }
  const fixture = index.fixtures.get(end.fixtureId);
  return fixture === undefined ? null : { kind: 'fixture', fixture };
}

/** The display name of an end. */
export function endName(end: ResolvedEnd): string {
  return end.kind === 'item' ? end.item.name : end.fixture.name;
}

/** Rows for every edge whose two ends still resolve, by item name then far end. */
export function connectionRows(
  connections: readonly ConnectionModel[],
  index: ConnectionIndex
): ConnectionRow[] {
  return connections
    .flatMap((edge) => {
      const item = index.world.items.get(edge.itemId);
      const far = resolveEnd(edge.to, index);
      return item === undefined || far === null ? [] : [{ edge, item, far }];
    })
    .toSorted(
      (a, b) =>
        a.item.name.localeCompare(b.item.name) || endName(a.far).localeCompare(endName(b.far))
    );
}

function rowText(row: ConnectionRow): string[] {
  const far = row.far.kind === 'item' ? [row.far.item.name, row.far.item.code ?? ''] : [];
  const fixture = row.far.kind === 'fixture' ? [row.far.fixture.name] : [];
  return [row.item.name, row.item.code ?? '', ...far, ...fixture];
}

/** Rows matching a kind and a case-insensitive query over names and codes on either end. */
export function filterConnections(
  rows: readonly ConnectionRow[],
  filter: { query: string; kind: ConnectionKindFilter }
): ConnectionRow[] {
  const query = filter.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.kind !== 'all' && row.far.kind !== filter.kind) return false;
    return query === '' || rowText(row).some((text) => text.toLowerCase().includes(query));
  });
}

/** How many edges, and how many distinct items and fixtures they touch. */
export function registrySummary(rows: readonly ConnectionRow[]) {
  const items = new Set<string>();
  const fixtures = new Set<string>();
  for (const row of rows) {
    items.add(row.item.id);
    if (row.far.kind === 'item') items.add(row.far.item.id);
    else fixtures.add(row.far.fixture.id);
  }
  return { connections: rows.length, items: items.size, fixtures: fixtures.size };
}

/** Why a connection cannot be made, or null when it can. */
export function connectRefusal(
  itemId: string,
  to: ConnectionEnd,
  connections: readonly ConnectionModel[],
  index: ConnectionIndex
): string | null {
  const item = index.world.items.get(itemId);
  const far = resolveEnd(to, index);
  if (item === undefined || far === null) return 'Choose both ends.';
  if (far.kind === 'item' && far.item.id === item.id) return 'An item cannot connect to itself.';
  const inactive = [item, ...(far.kind === 'item' ? [far.item] : [])].find(
    (entry) => entry.lifecycle !== 'active'
  );
  if (inactive !== undefined) {
    return `${inactive.name} is ${inactive.lifecycle}. Restore it before connecting it.`;
  }
  const exists = connections.some((edge) => sameEdge(edge, itemId, to));
  return exists ? `${item.name} and ${endName(far)} are already connected.` : null;
}

function sameEdge(edge: ConnectionModel, itemId: string, to: ConnectionEnd): boolean {
  if (to.kind === 'fixture') {
    return (
      edge.itemId === itemId && edge.to.kind === 'fixture' && edge.to.fixtureId === to.fixtureId
    );
  }
  if (edge.to.kind !== 'item') return false;
  const forward = edge.itemId === itemId && edge.to.itemId === to.itemId;
  const backward = edge.itemId === to.itemId && edge.to.itemId === itemId;
  return forward || backward;
}
