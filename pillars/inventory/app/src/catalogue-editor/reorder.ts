import type { CatalogueEnumOption, CatalogueOperation } from './types';

/**
 * Swaps an item with its adjacent active (non-archived) sibling in the direction given,
 * returning the full id order (including archived items, left in place). Archived items
 * are never chosen as the adjacent target, so moving past a run of them skips it.
 */
export function reorderAdjacent<
  T extends { readonly archivedAt: string | null; readonly id: string },
>(items: readonly T[], itemId: string, direction: -1 | 1): string[] {
  const ids = items.map((item) => item.id);
  const active = items.filter((item) => item.archivedAt === null);
  const adjacent = active[active.findIndex((item) => item.id === itemId) + direction];
  if (adjacent === undefined) return ids;
  const from = ids.indexOf(itemId);
  const to = ids.indexOf(adjacent.id);
  if (from >= 0 && to >= 0) {
    const fromId = ids[from];
    const toId = ids[to];
    if (fromId !== undefined && toId !== undefined) [ids[from], ids[to]] = [toId, fromId];
  }
  return ids;
}

/** Builds an adjacent enum-option reorder while retaining archived options in the full order. */
export function reorderOption(
  options: readonly CatalogueEnumOption[],
  optionId: string,
  direction: -1 | 1,
  parentId: string
): CatalogueOperation {
  return {
    kind: 'reorder',
    definition: 'enum_option',
    parentId,
    ids: reorderAdjacent(options, optionId, direction),
  };
}
