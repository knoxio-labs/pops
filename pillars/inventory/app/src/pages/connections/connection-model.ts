import { effectiveLocationId } from '../../foundation/model/placement-model.js';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { WebConnectionRow } from '../../inventory-web/useConnectionsRegistry.js';

/** One resolved item or fixture endpoint in a registry row. */
export type ConnectionEnd = WebConnectionRow['item'] | WebConnectionRow['far'];

/** A node consumed by the inventory connection force simulation. */
export interface ConnectionGraphNode {
  id: string;
  itemName: string;
  assetId: string | null;
  type: string | null;
  isFixture?: boolean;
}

/** The graph assembled from the unfiltered server registry. */
export interface ConnectionGraphData {
  nodes: ConnectionGraphNode[];
  edges: Array<{ source: string; target: string }>;
}

/** Returns a stable graph and trace key for a resolved endpoint. */
export function connectionEndKey(end: ConnectionEnd): string {
  return end.kind === 'item' ? end.id : `fixture:${end.id}`;
}

/** Returns the display name for a resolved endpoint. */
export function connectionEndName(end: ConnectionEnd): string {
  return end.name;
}

function graphNode(end: ConnectionEnd): ConnectionGraphNode {
  if (end.kind === 'item') {
    return {
      id: end.id,
      itemName: end.name,
      assetId: end.code,
      type: end.typeKey,
    };
  }

  return {
    id: connectionEndKey(end),
    itemName: end.name,
    assetId: null,
    type: end.type,
    isFixture: true,
  };
}

/** Builds graph nodes and edges without changing the registry's row order. */
export function connectionGraph(rows: readonly WebConnectionRow[]): ConnectionGraphData {
  const nodes = new Map<string, ConnectionGraphNode>();
  const edges: Array<{ source: string; target: string }> = [];

  for (const row of rows) {
    const itemNode = graphNode(row.item);
    const farNode = graphNode(row.far);
    if (!nodes.has(itemNode.id)) nodes.set(itemNode.id, itemNode);
    if (!nodes.has(farNode.id)) nodes.set(farNode.id, farNode);
    edges.push({ source: itemNode.id, target: farNode.id });
  }

  return { nodes: [...nodes.values()], edges };
}

/** Resolves the source item's effective room for a registry row. */
export function connectionRoom(row: WebConnectionRow, world: PlacementWorld): string {
  const source = world.items.get(row.item.id);
  if (source !== undefined) {
    const locationId = effectiveLocationId(world, source.id);
    if (locationId !== null) return world.locations.get(locationId)?.name ?? 'Unknown room';
  }

  if (row.far.kind === 'fixture' && row.far.locationId !== null) {
    return world.locations.get(row.far.locationId)?.name ?? 'Unknown room';
  }

  return 'Unknown room';
}
