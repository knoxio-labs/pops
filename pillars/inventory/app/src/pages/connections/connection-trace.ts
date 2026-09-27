import { connectionEndKey } from './connection-model.js';

import type { WebConnectionRow } from '../../inventory-web/useConnectionsRegistry.js';
import type { ConnectionEnd } from './connection-model.js';

/** One node in the page-local breadth-first connection trace. */
export interface ConnectionTraceNode {
  key: string;
  end: ConnectionEnd;
  depth: number;
  children: ConnectionTraceNode[];
}

/** A trace rooted at one item, or `null` when that item is not in the registry. */
export interface ConnectionTrace {
  root: ConnectionTraceNode;
}

type ItemEnd = WebConnectionRow['item'];

function appendNeighbour(
  neighbours: Map<string, ConnectionEnd[]>,
  key: string,
  end: ConnectionEnd
): void {
  const current = neighbours.get(key);
  if (current === undefined) neighbours.set(key, [end]);
  else current.push(end);
}

/**
 * Builds a breadth-first item chain from registry rows. Item-to-item edges
 * are traversed in both directions; fixtures are leaves and are never used
 * as a bridge to another item.
 */
export function connectionTrace(
  rows: readonly WebConnectionRow[],
  itemId: string
): ConnectionTrace | null {
  const items = new Map<string, ItemEnd>();
  const neighbours = new Map<string, ConnectionEnd[]>();

  for (const row of rows) {
    items.set(row.item.id, row.item);
    appendNeighbour(neighbours, row.item.id, row.far);

    if (row.far.kind === 'item') {
      items.set(row.far.id, row.far);
      appendNeighbour(neighbours, row.far.id, row.item);
    }
  }

  const rootEnd = items.get(itemId);
  if (rootEnd === undefined) return null;

  const root: ConnectionTraceNode = {
    key: connectionEndKey(rootEnd),
    end: rootEnd,
    depth: 0,
    children: [],
  };
  const seen = new Set<string>([root.key]);
  const queue: ConnectionTraceNode[] = [root];

  for (let index = 0; index < queue.length; index += 1) {
    const node = queue[index];
    if (node === undefined || node.end.kind !== 'item') continue;

    for (const end of neighbours.get(node.key) ?? []) {
      const key = connectionEndKey(end);
      if (seen.has(key)) continue;
      seen.add(key);
      const child: ConnectionTraceNode = {
        key,
        end,
        depth: node.depth + 1,
        children: [],
      };
      node.children.push(child);
      queue.push(child);
    }
  }

  return { root };
}
