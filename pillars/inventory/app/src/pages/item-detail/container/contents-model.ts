import { deepContents } from '../../../foundation/model/placement-model.js';

import type { ItemRowModel } from '../../../foundation/model/model.js';
import type { PlacementWorld } from '../../../foundation/model/placement-model.js';

/** Returns direct-content rows matching a case-insensitive name or code filter. */
export function visibleContentRows(
  inside: readonly string[],
  world: PlacementWorld,
  query: string
): ItemRowModel[] {
  const needle = query.trim().toLocaleLowerCase();
  return inside
    .map((id) => world.items.get(id))
    .filter((row): row is ItemRowModel => row !== undefined)
    .filter((row) => {
      if (needle.length === 0) return true;
      return (
        row.name.toLocaleLowerCase().includes(needle) ||
        row.code?.toLocaleLowerCase().includes(needle) === true
      );
    });
}

/** Counts nested contents while using server totals when a child total is available. */
export function nestedContentCount(
  inside: readonly string[],
  world: PlacementWorld,
  contentCounts: Readonly<Record<string, { readonly direct: number; readonly deep: number }>>
): number {
  return inside.reduce((total, id) => {
    const known = contentCounts[id]?.deep;
    if (known !== undefined) return total + known;
    const item = world.items.get(id);
    if (item === undefined || item.container === null) return total;
    return total + deepContents(world, id).length;
  }, 0);
}
