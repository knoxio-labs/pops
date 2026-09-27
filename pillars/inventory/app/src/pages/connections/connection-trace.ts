import { endKey, endName } from './connection-model.js';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { ConnectionRow, ResolvedEnd } from './connection-model.js';

/** One node in the breadth-first connection trace. */
export interface ChainNode {
  key: string;
  end: ResolvedEnd;
  depth: number;
  children: ChainNode[];
}

/** A trace rooted at one item, with the start item excluded from its counts. */
export interface Chain {
  root: ChainNode;
  items: number;
  fixtures: number;
}

/** Compatibility name for the page's trace node type. */
export type ConnectionTraceNode = ChainNode;

/** Compatibility name for the page's trace type. */
export type ConnectionTrace = Chain;

function appendNeighbour(
  neighbours: Map<string, ResolvedEnd[]>,
  key: string,
  end: ResolvedEnd
): void {
  const current = neighbours.get(key);
  if (current === undefined) neighbours.set(key, [end]);
  else current.push(end);
}

function neighbours(rows: readonly ConnectionRow[]): Map<string, ResolvedEnd[]> {
  const result = new Map<string, ResolvedEnd[]>();
  for (const row of rows) {
    const source: ResolvedEnd = { kind: 'item', item: row.item };
    appendNeighbour(result, endKey(source), row.far);
    if (row.far.kind === 'item') appendNeighbour(result, endKey(row.far), source);
  }
  return result;
}

/** Traces every resolvable endpoint reachable from an item. */
export function traceChain(
  itemId: string,
  rows: readonly ConnectionRow[],
  world: PlacementWorld
): Chain | null {
  const item = world.items.get(itemId);
  if (item === undefined) return null;

  const root: ChainNode = {
    key: `item:${item.id}`,
    end: { kind: 'item', item },
    depth: 0,
    children: [],
  };
  const seen = new Set<string>([root.key]);
  const queue: ChainNode[] = [root];
  const byItem = neighbours(rows);
  let items = 0;
  let fixtures = 0;

  for (let index = 0; index < queue.length; index += 1) {
    const node = queue[index];
    if (node === undefined || node.end.kind !== 'item') continue;

    for (const end of byItem.get(node.key) ?? []) {
      const key = endKey(end);
      if (seen.has(key)) continue;
      seen.add(key);
      const child: ChainNode = {
        key,
        end,
        depth: node.depth + 1,
        children: [],
      };
      node.children.push(child);
      queue.push(child);
      if (end.kind === 'item') items += 1;
      else fixtures += 1;
    }
  }

  return { root, items, fixtures };
}

/** Returns the display name of a chain root for callers rendering a heading. */
export function traceRootName(trace: Chain): string {
  return endName(trace.root.end);
}

/** Traces already-resolved rows when the caller does not need location data. */
export function connectionTrace(
  rows: readonly ConnectionRow[],
  itemId: string
): ConnectionTrace | null {
  const items = new Map<string, ItemRowModel>();
  for (const row of rows) {
    items.set(row.item.id, row.item);
    if (row.far.kind === 'item') items.set(row.far.item.id, row.far.item);
  }
  const world: PlacementWorld = { items, locations: new Map() };
  return traceChain(itemId, rows, world);
}
