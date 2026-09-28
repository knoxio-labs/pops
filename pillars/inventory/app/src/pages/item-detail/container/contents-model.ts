import { deepContents } from '../../../foundation/model/placement-model.js';
import { compareInventoryNames } from '../../../lib/sort-names.js';

import type { ItemRowModel } from '../../../foundation/model/model.js';
import type { PlacementWorld } from '../../../foundation/model/placement-model.js';

/** The sort choices available for direct container contents. */
export const CONTENTS_SORT_OPTIONS = ['name-asc', 'name-desc'] as const;

/** Identifies the direction used to order direct container contents by name. */
export type ContentsSort = (typeof CONTENTS_SORT_OPTIONS)[number];

/** The default direct-content order shown in a container. */
export const DEFAULT_CONTENTS_SORT: ContentsSort = 'name-asc';

function sortRows(rows: readonly ItemRowModel[], sort: ContentsSort): ItemRowModel[] {
  const comparator =
    sort === 'name-desc'
      ? (left: ItemRowModel, right: ItemRowModel) => compareInventoryNames(right, left)
      : compareInventoryNames;
  return rows.toSorted(comparator);
}

/** Returns direct-content rows matching a case-insensitive name or code filter. */
export function visibleContentRows(
  inside: readonly string[],
  world: PlacementWorld,
  query: string,
  sort: ContentsSort = DEFAULT_CONTENTS_SORT
): ItemRowModel[] {
  const needle = query.trim().toLocaleLowerCase();
  const rows = inside
    .map((id) => world.items.get(id))
    .filter((row): row is ItemRowModel => row !== undefined)
    .filter((row) => {
      if (needle.length === 0) return true;
      return (
        row.name.toLocaleLowerCase().includes(needle) ||
        row.code?.toLocaleLowerCase().includes(needle) === true
      );
    });
  return sortRows(rows, sort);
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
