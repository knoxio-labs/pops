import { inventoryItems } from '@/fixtures/inventory-items';
import { locationTree } from '@/fixtures/inventory-locations';

import type { InventoryFixtureItem } from '@/fixtures/inventory-items';

import type { LocationTreeNode } from './utils';

export interface LocationsPageData {
  tree: LocationTreeNode[];
  items: InventoryFixtureItem[];
  isLoading: boolean;
}

export interface LocationsPageSeed {
  selectedId: string | null;
  addingRoot: boolean;
  addingChildOf: string | null;
  movingId: string | null;
  deleteConfirmId: string | null;
  renamingId: string | null;
  /** Seeds `activeId`/`overId` so a state can open already mid-drag. */
  dragState?: { activeId: string; overId: string };
  /** Seeds which collapsed rows start open, for a state that targets a deep branch. */
  expandedIds?: ReadonlySet<string>;
}

export interface LocationsPagePending {
  create: boolean;
  delete: boolean;
}

export interface LocationsPageCallbacks {
  /** In place of `navigate('/inventory/reports/insurance[?locationId=]')`: the canvas is an iframe, so a real navigation would leave the surface. */
  onInsuranceReport: (locationId?: string) => void;
  /** In place of `navigate(`/inventory/items/${id}`)`. */
  onItemOpen: (id: string) => void;
  /** In place of the "Add Item Here" button's navigation. */
  onAddItem: (locationId: string) => void;
}

export const DEFAULT_LOCATIONS_DATA: LocationsPageData = {
  tree: locationTree,
  items: inventoryItems,
  isLoading: false,
};

export const DEFAULT_LOCATIONS_SEED: LocationsPageSeed = {
  selectedId: null,
  addingRoot: false,
  addingChildOf: null,
  movingId: null,
  deleteConfirmId: null,
  renamingId: null,
};

export const DEFAULT_LOCATIONS_PENDING: LocationsPagePending = {
  create: false,
  delete: false,
};

export const DEFAULT_LOCATIONS_CALLBACKS: LocationsPageCallbacks = {
  onInsuranceReport: () => {},
  onItemOpen: () => {},
  onAddItem: () => {},
};

export function itemCountByLocationId(items: InventoryFixtureItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    if (!item.locationId) continue;
    map.set(item.locationId, (map.get(item.locationId) ?? 0) + 1);
  }
  return map;
}

export function collectDescendantIds(node: LocationTreeNode): string[] {
  const ids: string[] = [];
  for (const child of node.children) {
    ids.push(child.id);
    ids.push(...collectDescendantIds(child));
  }
  return ids;
}
