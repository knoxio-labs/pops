import { effectiveLocationId, locationPath } from '../../foundation/model/placement-model.js';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { WebConnectionRow } from '../../inventory-web/useConnectionsRegistry.js';

/** Fixture kinds persisted by the inventory connections API. */
export type FixtureKind = 'power' | 'light' | 'switch' | 'network' | 'antenna' | 'water';

/** A fixture endpoint resolved for display and navigation. */
export interface FixtureEnd {
  id: string;
  name: string;
  type: string;
  kind: FixtureKind | null;
  locationId: string | null;
}

/** An item or fixture endpoint resolved against the current inventory world. */
export type ResolvedEnd =
  | { kind: 'item'; item: ItemRowModel }
  | { kind: 'fixture'; fixture: FixtureEnd };

/**
 * One server registry row with both endpoints resolved for page rendering. The raw `source` is
 * kept unchanged for mutation calls.
 */
export interface ConnectionRow {
  id: string;
  createdAt: string;
  item: ItemRowModel;
  far: ResolvedEnd;
  source: WebConnectionRow;
}

/** A node consumed by the inventory connection force simulation. */
export interface ConnectionGraphNode {
  id: string;
  itemName: string;
  assetId: string | null;
  type: string | null;
  isFixture?: boolean;
}

/** The graph assembled from resolved, unfiltered registry rows. */
export interface RegistryGraph {
  nodes: ConnectionGraphNode[];
  edges: Array<{ source: string; target: string }>;
}

/** Compatibility name for the graph data used by the existing page component. */
export type ConnectionGraphData = RegistryGraph;

/** Returns the stable key used by list, graph, trace, and URL navigation. */
export function endKey(end: ResolvedEnd): string {
  return end.kind === 'item' ? `item:${end.item.id}` : `fixture:${end.fixture.id}`;
}

/** Returns the display name for a resolved endpoint. */
export function endName(end: ResolvedEnd): string {
  return end.kind === 'item' ? end.item.name : end.fixture.name;
}

/** Returns the user-facing label for a known fixture kind. */
export function fixtureKindLabel(kind: FixtureKind | null, type: string): string {
  if (kind === null) return type;
  return {
    antenna: 'Antenna point',
    light: 'Light fitting',
    network: 'Network port',
    power: 'Power outlet',
    switch: 'Switch',
    water: 'Water point',
  }[kind];
}

/** Returns distinct item IDs in the raw registry's first-seen endpoint order. */
export function connectionItemIds(rows: readonly WebConnectionRow[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };

  for (const row of rows) {
    add(row.item.id);
    if (row.far.kind === 'item') add(row.far.id);
  }
  return ids;
}

function fixtureKind(type: string): FixtureKind | null {
  return type === 'power' ||
    type === 'light' ||
    type === 'switch' ||
    type === 'network' ||
    type === 'antenna' ||
    type === 'water'
    ? type
    : null;
}

function resolveEnd(
  end: WebConnectionRow['item'] | WebConnectionRow['far'],
  world: PlacementWorld
): ResolvedEnd | null {
  if (end.kind === 'item') {
    const item = world.items.get(end.id);
    return item === undefined ? null : { kind: 'item', item };
  }

  return {
    kind: 'fixture',
    fixture: {
      id: end.id,
      name: end.name,
      type: end.type,
      kind: fixtureKind(end.type),
      locationId: end.locationId,
    },
  };
}

/** Resolves registry rows against the placement world while preserving server order. */
export function connectionRows(
  rows: readonly WebConnectionRow[],
  world: PlacementWorld
): ConnectionRow[] {
  return rows.flatMap((source) => {
    const item = world.items.get(source.item.id);
    const far = resolveEnd(source.far, world);
    if (item === undefined || far === null) return [];
    return [{ id: source.id, createdAt: source.createdAt, item, far, source }];
  });
}

function graphNode(end: ResolvedEnd): ConnectionGraphNode {
  if (end.kind === 'item') {
    return {
      id: endKey(end),
      itemName: end.item.name,
      assetId: end.item.code,
      type: end.item.typeName,
    };
  }

  return {
    id: endKey(end),
    itemName: end.fixture.name,
    assetId: null,
    type: 'Fixture',
    isFixture: true,
  };
}

/** Builds graph nodes and edges without changing the registry's row order. */
export function registryGraph(rows: readonly ConnectionRow[]): RegistryGraph {
  const nodes = new Map<string, ConnectionGraphNode>();
  const edges: Array<{ source: string; target: string }> = [];

  for (const row of rows) {
    const itemNode = graphNode({ kind: 'item', item: row.item });
    const farNode = graphNode(row.far);
    if (!nodes.has(itemNode.id)) nodes.set(itemNode.id, itemNode);
    if (!nodes.has(farNode.id)) nodes.set(farNode.id, farNode);
    edges.push({ source: itemNode.id, target: farNode.id });
  }

  return { nodes: [...nodes.values()], edges };
}

/** Compatibility alias for the existing page component's graph helper name. */
export const connectionGraph = registryGraph;

/** Resolves the source item's effective room for a registry row. */
export function connectionRoom(row: ConnectionRow, world: PlacementWorld): string {
  const locationId = effectiveLocationId(world, row.item.id);
  if (locationId === null) return 'In hand';
  const path = locationPath(world, locationId);
  return (path[1] ?? path[0])?.name ?? 'Unknown place';
}

/** Compatibility alias for the original page-local key name. */
export const connectionEndKey = endKey;

/** Compatibility alias for the original page-local display-name name. */
export const connectionEndName = endName;

/** Compatibility name for a resolved endpoint used by page action handlers. */
export type ConnectionEnd = ResolvedEnd;
