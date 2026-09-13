import { countDescendants } from './utils';

import type { LocationTreeNode } from './utils';

export interface LocationDeleteStats {
  childCount: number;
  descendantCount: number;
  itemCount: number;
  totalItemCount: number;
}

/**
 * Mirrors `getDeleteStats` in `pillars/inventory/src/db/services/locations-queries.ts`:
 * `itemCount` is items directly at this location, `totalItemCount` adds every
 * descendant location's items. The delete endpoint blocks (returns
 * `requiresConfirmation`) when `childCount > 0 || itemCount > 0`: a childless
 * location with no direct items deletes immediately even if the caller passed
 * no `force`.
 */
export function computeDeleteStats(
  node: LocationTreeNode,
  itemCountByLocationId: ReadonlyMap<string, number>
): LocationDeleteStats {
  const descendantIds = collectDescendantIds(node);
  const itemCount = itemCountByLocationId.get(node.id) ?? 0;
  const totalItemCount =
    itemCount + descendantIds.reduce((sum, id) => sum + (itemCountByLocationId.get(id) ?? 0), 0);
  return {
    childCount: node.children.length,
    descendantCount: countDescendants(node),
    itemCount,
    totalItemCount,
  };
}

export function requiresDeleteConfirmation(stats: LocationDeleteStats): boolean {
  return stats.childCount > 0 || stats.itemCount > 0;
}

function collectDescendantIds(node: LocationTreeNode): string[] {
  const ids: string[] = [];
  for (const child of node.children) {
    ids.push(child.id);
    ids.push(...collectDescendantIds(child));
  }
  return ids;
}
