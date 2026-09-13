import type { InventoryFixtureItem } from '@/fixtures/inventory-items';

/**
 * Pure data shapes and helpers for `LocationContentsPanel`.
 *
 * The app component drives this from `useLocationItems`, which fires one
 * query for the location itself and one per descendant when sub-locations
 * are included. There is no network here, so the panel takes the direct and
 * sub-location item lists as props instead and this module keeps only what
 * was already pure: the descendant walk and the combination the toggle
 * switches between.
 */
export type InventoryItem = InventoryFixtureItem;

export interface LocationTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  children: LocationTreeNode[];
}

export function collectDescendantIds(node: LocationTreeNode): string[] {
  const ids: string[] = [];
  for (const child of node.children) {
    ids.push(child.id);
    ids.push(...collectDescendantIds(child));
  }
  return ids;
}

/** The items a location shows: direct items alone, or with every descendant's added in. */
export function combineLocationItems(
  directItems: InventoryItem[],
  subLocationItems: InventoryItem[],
  includeSubLocations: boolean
): InventoryItem[] {
  if (!includeSubLocations) return directItems;
  return [...directItems, ...subLocationItems];
}
