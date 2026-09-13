import { LocationContentsPanel } from '../location-contents-panel';
import { buildBreadcrumb } from './utils';

import type { InventoryItem } from '../location-contents-panel-data';
import type { LocationTreeNode } from './utils';

export interface SelectedLocationPanelProps {
  selectedId: string | null;
  nodeMap: Map<string, LocationTreeNode>;
  directItems: InventoryItem[];
  subLocationItems: InventoryItem[];
  onItemClick: (id: string) => void;
  onAddItem: (locationId: string) => void;
}

/** Ported from the app's `SelectedLocationPanel.tsx`: the query-driven item lists become props. */
export function SelectedLocationPanel({
  selectedId,
  nodeMap,
  directItems,
  subLocationItems,
  onItemClick,
  onAddItem,
}: SelectedLocationPanelProps) {
  if (!selectedId) {
    return (
      <div className="border rounded-lg p-4 text-sm text-muted-foreground text-center">
        Select a location to see details
      </div>
    );
  }
  const selectedNode = nodeMap.get(selectedId);
  if (!selectedNode) return null;
  return (
    <LocationContentsPanel
      locationId={selectedId}
      locationName={selectedNode.name}
      breadcrumb={buildBreadcrumb(selectedId, nodeMap)}
      node={selectedNode}
      directItems={directItems}
      subLocationItems={subLocationItems}
      onItemClick={onItemClick}
      onAddItem={onAddItem}
    />
  );
}
