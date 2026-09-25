/**
 * The chain a trace walks from one item, and the graph the registry draws.
 * A trace follows item to item edges breadth first, so each thing sits at
 * its shortest distance from the start and appears once; fixtures hang off
 * the item they power or serve and are never walked through.
 */
import { connectionRows, endName } from './connection-model';

import type { ConnectionModel } from '@/kit/inventory/fixtures/fixture-model';

import type { ConnectionIndex, ResolvedEnd } from './connection-model';

/** One node of a traced chain. */
export interface ChainNode {
  key: string;
  end: ResolvedEnd;
  depth: number;
  children: ChainNode[];
}

/** A traced chain and its counts, start excluded. */
export interface Chain {
  root: ChainNode;
  items: number;
  fixtures: number;
}

/** Stable node key: kind and id. */
export function endKey(end: ResolvedEnd): string {
  return end.kind === 'item' ? `item:${end.item.id}` : `fixture:${end.fixture.id}`;
}

function neighbours(
  itemId: string,
  connections: readonly ConnectionModel[],
  index: ConnectionIndex
): ResolvedEnd[] {
  const touching = connections.filter(
    (edge) => edge.itemId === itemId || (edge.to.kind === 'item' && edge.to.itemId === itemId)
  );
  return connectionRows(touching, index)
    .map((row) => (row.item.id === itemId ? row.far : { kind: 'item' as const, item: row.item }))
    .toSorted((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'item' ? -1 : 1;
      return endName(a).localeCompare(endName(b));
    });
}

/** Traces everything reachable from an item. Null when the item is unknown. */
export function traceChain(
  itemId: string,
  connections: readonly ConnectionModel[],
  index: ConnectionIndex
): Chain | null {
  const start = index.world.items.get(itemId);
  if (start === undefined) return null;
  const root: ChainNode = {
    key: `item:${itemId}`,
    end: { kind: 'item', item: start },
    depth: 0,
    children: [],
  };
  const seen = new Set([root.key]);
  const queue = [root];
  const counts = { items: 0, fixtures: 0 };
  for (let node = queue.shift(); node !== undefined; node = queue.shift()) {
    if (node.end.kind !== 'item') continue;
    for (const end of neighbours(node.end.item.id, connections, index)) {
      const key = endKey(end);
      if (seen.has(key)) continue;
      seen.add(key);
      const child: ChainNode = { key, end, depth: node.depth + 1, children: [] };
      node.children.push(child);
      queue.push(child);
      counts[end.kind === 'item' ? 'items' : 'fixtures'] += 1;
    }
  }
  return { root, ...counts };
}

/** The graph kit's input: nodes with a type label, edges as id pairs. */
export interface RegistryGraph {
  nodes: Array<{ id: string; itemName: string; assetId: string | null; type: string | null }>;
  edges: Array<{ source: string; target: string }>;
}

/** Every resolvable edge as a graph; fixtures carry the type `Fixture`. */
export function registryGraph(
  connections: readonly ConnectionModel[],
  index: ConnectionIndex
): RegistryGraph {
  const nodes = new Map<string, RegistryGraph['nodes'][number]>();
  const edges: RegistryGraph['edges'] = [];
  for (const row of connectionRows(connections, index)) {
    for (const end of [{ kind: 'item' as const, item: row.item }, row.far]) {
      const key = endKey(end);
      if (nodes.has(key)) continue;
      nodes.set(key, {
        id: key,
        itemName: endName(end),
        assetId: end.kind === 'item' ? end.item.code : null,
        type: end.kind === 'item' ? end.item.typeName : 'Fixture',
      });
    }
    edges.push({ source: `item:${row.item.id}`, target: endKey(row.far) });
  }
  return { nodes: [...nodes.values()], edges };
}
