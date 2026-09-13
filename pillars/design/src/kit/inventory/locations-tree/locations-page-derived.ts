import { collectDescendantIds } from './locations-page-types';

import type { LocationsPageData } from './locations-page-types';
import type { useLocationSelectionState } from './use-location-selection';
import type { LocationTreeNode } from './utils';

interface Args {
  data: LocationsPageData;
  tree: LocationTreeNode[];
  nodeMap: Map<string, LocationTreeNode>;
  selection: ReturnType<typeof useLocationSelectionState>;
}

/** Everything `LocationsPage` needs to render that isn't state on its own: whether the tree is empty, which nodes the dialogs point at, and the selected location's item lists. */
export function computeLocationsPageDerived({ data, tree, nodeMap, selection }: Args) {
  const showEmpty = !data.isLoading && tree.length === 0;
  const movingNode = selection.movingId ? nodeMap.get(selection.movingId) : null;
  const activeNode = selection.activeId ? nodeMap.get(selection.activeId) : null;
  const selectedNode = selection.selectedId ? nodeMap.get(selection.selectedId) : null;
  const descendantIds = selectedNode ? new Set(collectDescendantIds(selectedNode)) : null;
  const directItems = selection.selectedId
    ? data.items.filter((item) => item.locationId === selection.selectedId)
    : [];
  const subLocationItems = descendantIds
    ? data.items.filter((item) => item.locationId !== null && descendantIds.has(item.locationId))
    : [];
  return { showEmpty, movingNode, activeNode, selectedNode, directItems, subLocationItems };
}
