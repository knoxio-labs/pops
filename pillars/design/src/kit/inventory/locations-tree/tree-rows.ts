/**
 * The tree as the rows it draws: depth-first, children only under expanded
 * nodes, and with a filter, only the places whose name matches plus the
 * ancestors that lead to them (opened, so a match is never hidden).
 */
import { locationPath } from '../foundation';
import { childPlaces } from './tree-model';

import type { LocationModel, PlacementWorld } from '../foundation';

/** One drawn row of the tree. */
export interface TreeRow {
  node: LocationModel;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  /** The filter matched this row's own name (not only a descendant's). */
  matched: boolean;
}

function matchingIds(world: PlacementWorld, filter: string): Set<string> | null {
  const needle = filter.trim().toLowerCase();
  if (needle === '') return null;
  const shown = new Set<string>();
  for (const node of world.locations.values()) {
    if (!node.name.toLowerCase().includes(needle)) continue;
    for (const step of locationPath(world, node.id)) shown.add(step.id);
  }
  return shown;
}

/** The rows to draw for `expanded` ids, narrowed by `filter`. */
export function treeRows(
  world: PlacementWorld,
  expanded: ReadonlySet<string>,
  filter = ''
): TreeRow[] {
  const shown = matchingIds(world, filter);
  const needle = filter.trim().toLowerCase();
  const rows: TreeRow[] = [];
  const walk = (parentId: string | null, depth: number): void => {
    for (const node of childPlaces(world, parentId)) {
      if (shown !== null && !shown.has(node.id)) continue;
      const hasChildren = childPlaces(world, node.id).length > 0;
      const open = hasChildren && (shown !== null || expanded.has(node.id));
      const matched = needle !== '' && node.name.toLowerCase().includes(needle);
      rows.push({ node, depth, hasChildren, expanded: open, matched });
      if (open) walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

/** Ids to expand so `placeId` is visible: every ancestor, not the place itself. */
export function revealIds(world: PlacementWorld, placeId: string): string[] {
  return locationPath(world, placeId)
    .slice(0, -1)
    .map((node) => node.id);
}

/** The row after or before `id`, for j/k and the arrow keys. Stays put at either end. */
export function stepRow(rows: readonly TreeRow[], id: string | null, delta: 1 | -1): string | null {
  if (rows.length === 0) return null;
  const at = rows.findIndex((row) => row.node.id === id);
  if (at < 0) return rows[0]?.node.id ?? null;
  const next = rows[Math.min(rows.length - 1, Math.max(0, at + delta))];
  return next?.node.id ?? null;
}
