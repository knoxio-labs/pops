import { inventoryTypes } from '@/fixtures/inventory-items';
import { locationTree } from '@/fixtures/inventory-locations';

import { buildLocationPathMap, flattenLocations } from './filter-items';

import type { SelectOption } from '@pops/ui';

import type { ItemsFilterState } from './filter-items';
import type { ViewMode } from './view-mode';

export type ItemsPageFiltersSeed = ItemsFilterState;

export interface ItemsPageOptions {
  typeOptions: SelectOption[];
  locationOptions: SelectOption[];
  locationPathMap: ReadonlyMap<string, { id: string; name: string }[]>;
}

export interface ItemsPageUiSeed {
  viewMode: ViewMode;
  deletingItemId: string | null;
}

export interface ItemsPageCallbacks {
  /** Row open and asset-id-match open, in place of the app's `navigate(`/inventory/items/${id}`)`. */
  onItemOpen: (id: string) => void;
  /** In place of `navigate(`/inventory/items/${id}/edit`)`. */
  onItemEdit: (id: string) => void;
  /** In place of `navigate('/inventory/items/new')`. */
  onAddItem: () => void;
  /** In place of `deleteMutation.mutate({ id })`. */
  onDeleteConfirm: (id: string) => void;
}

/** `useItemsPageModel.ts`'s `VIEW_STORAGE_KEY`, ported as-is. */
export const VIEW_STORAGE = 'inventory-view-mode';

export const PARAM_TO_FILTER_KEY = {
  q: 'search',
  type: 'typeFilter',
  condition: 'conditionFilter',
  inUse: 'inUseFilter',
  locationId: 'locationFilter',
} as const satisfies Record<string, keyof ItemsFilterState>;

export const DEFAULT_TYPE_OPTIONS: SelectOption[] = [
  { value: '', label: 'All Types' },
  ...inventoryTypes.map((type) => ({ value: type, label: type })),
];

export const DEFAULT_LOCATION_OPTIONS = flattenLocations(locationTree);
export const DEFAULT_LOCATION_PATH_MAP = buildLocationPathMap(locationTree);

export const DEFAULT_ITEMS_PAGE_FILTERS_SEED: ItemsPageFiltersSeed = {
  search: '',
  typeFilter: '',
  conditionFilter: '',
  inUseFilter: '',
  locationFilter: '',
};

export const DEFAULT_ITEMS_PAGE_OPTIONS: ItemsPageOptions = {
  typeOptions: DEFAULT_TYPE_OPTIONS,
  locationOptions: DEFAULT_LOCATION_OPTIONS,
  locationPathMap: DEFAULT_LOCATION_PATH_MAP,
};

export const DEFAULT_ITEMS_PAGE_UI_SEED: ItemsPageUiSeed = {
  viewMode: 'table',
  deletingItemId: null,
};

export const DEFAULT_ITEMS_PAGE_CALLBACKS: ItemsPageCallbacks = {
  onItemOpen: () => {},
  onItemEdit: () => {},
  onAddItem: () => {},
  onDeleteConfirm: () => {},
};
