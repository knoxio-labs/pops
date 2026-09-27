import { locationPath } from '../../foundation/model/placement-model.js';

import type { LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';

/** One location row visible in the tree. */
export interface TreeRow {
  readonly node: LocationModel;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly expanded: boolean;
  readonly matched: boolean;
}

function childPlaces(world: PlacementWorld, parentId: string | null): LocationModel[] {
  return [...world.locations.values()].filter((place) => place.parentId === parentId);
}

function matchingIds(world: PlacementWorld, filter: string): ReadonlySet<string> | null {
  const needle = filter.trim().toLowerCase();
  if (needle === '') return null;
  const shown = new Set<string>();
  for (const place of world.locations.values()) {
    if (!place.name.toLowerCase().includes(needle)) continue;
    for (const ancestor of locationPath(world, place.id)) shown.add(ancestor.id);
  }
  return shown;
}

/** Flattens the expanded location tree and keeps ancestors of filtered matches visible. */
export function treeRows(
  world: PlacementWorld,
  expanded: ReadonlySet<string>,
  filter = ''
): TreeRow[] {
  const shown = matchingIds(world, filter);
  const needle = filter.trim().toLowerCase();
  const rows: TreeRow[] = [];

  const walk = (parentId: string | null, depth: number): void => {
    for (const place of childPlaces(world, parentId)) {
      if (shown !== null && !shown.has(place.id)) continue;
      const hasChildren = childPlaces(world, place.id).length > 0;
      const open = hasChildren && (shown !== null || expanded.has(place.id));
      rows.push({
        node: place,
        depth,
        hasChildren,
        expanded: open,
        matched: needle !== '' && place.name.toLowerCase().includes(needle),
      });
      if (open) walk(place.id, depth + 1);
    }
  };

  walk(null, 0);
  return rows;
}

/** Returns the ancestor ids that must be expanded to reveal a location. */
export function revealIds(world: PlacementWorld, placeId: string): string[] {
  return locationPath(world, placeId)
    .slice(0, -1)
    .map((place) => place.id);
}

/** Moves a selected row by one step while clamping at the visible tree edges. */
export function stepRow(rows: readonly TreeRow[], id: string | null, delta: 1 | -1): string | null {
  if (rows.length === 0) return null;
  const index = rows.findIndex((row) => row.node.id === id);
  if (index < 0) return rows[0]?.node.id ?? null;
  const nextIndex = Math.min(rows.length - 1, Math.max(0, index + delta));
  return rows[nextIndex]?.node.id ?? null;
}
