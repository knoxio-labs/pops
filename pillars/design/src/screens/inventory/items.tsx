import { inventoryItem, inventoryItems, inventoryItemsEmpty } from '@/fixtures/inventory-items';
import { inventoryItemsNoValues } from '@/fixtures/inventory-items-list';
import { ItemsPageBody } from '@/kit/inventory/items-list/items-page-body';
import {
  DEFAULT_ITEMS_PAGE_CALLBACKS,
  DEFAULT_ITEMS_PAGE_FILTERS_SEED,
  DEFAULT_ITEMS_PAGE_OPTIONS,
  DEFAULT_ITEMS_PAGE_UI_SEED,
} from '@/kit/inventory/items-list/items-page-types';
import { useItemsPageState } from '@/kit/inventory/items-list/use-items-page-state';
import { Package, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button, PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { InventoryFixtureItem } from '@/fixtures/inventory-items';
import type {
  ItemsPageCallbacks,
  ItemsPageFiltersSeed,
  ItemsPageOptions,
  ItemsPageUiSeed,
} from '@/kit/inventory/items-list/items-page-types';

export const meta: ScreenMeta = { title: 'Items', order: 1, frame: 'web' };

function AddItemButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick} prefix={<Plus className="h-4 w-4" />}>
      Add Item
    </Button>
  );
}

export interface ItemsPageProps {
  items?: InventoryFixtureItem[];
  options?: ItemsPageOptions;
  isLoading?: boolean;
  filtersSeed?: ItemsPageFiltersSeed;
  uiSeed?: ItemsPageUiSeed;
  deletePending?: boolean;
  callbacks?: ItemsPageCallbacks;
}

/**
 * `/inventory`: the items list, its filters, the table/grid toggle and the
 * delete confirmation. `useItemsPageState` holds everything the app drives
 * through `useSearchParams`, which does not survive the port: the canvas is
 * an iframe, so a real `useSearchParams`/`navigate` would leave the surface,
 * and there is no server to query. The one behaviour genuinely absent is the
 * URL round-trip: filters here do not survive a reload or become a shareable
 * link, which on the real page they do.
 */
export function ItemsPage({
  items = inventoryItems,
  options = DEFAULT_ITEMS_PAGE_OPTIONS,
  isLoading = false,
  filtersSeed = DEFAULT_ITEMS_PAGE_FILTERS_SEED,
  uiSeed = DEFAULT_ITEMS_PAGE_UI_SEED,
  deletePending = false,
  callbacks = DEFAULT_ITEMS_PAGE_CALLBACKS,
}: ItemsPageProps) {
  const { t } = useTranslation('inventory');
  const state = useItemsPageState(items, filtersSeed, uiSeed);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        icon={<Package className="h-6 w-6 text-muted-foreground" />}
        actions={<AddItemButton onClick={callbacks.onAddItem} />}
      />
      <ItemsPageBody
        state={state}
        options={options}
        isLoading={isLoading}
        deletePending={deletePending}
        callbacks={callbacks}
      />
    </div>
  );
}

export const states: ScreenStates = {
  loading: () => <ItemsPage isLoading />,
  empty: () => <ItemsPage items={inventoryItemsEmpty} />,
  'no-matches': () => (
    <ItemsPage filtersSeed={{ ...DEFAULT_ITEMS_PAGE_FILTERS_SEED, search: 'zzz-no-match' }} />
  ),
  grid: () => <ItemsPage uiSeed={{ ...DEFAULT_ITEMS_PAGE_UI_SEED, viewMode: 'grid' }} />,
  deleting: () => (
    <ItemsPage uiSeed={{ ...DEFAULT_ITEMS_PAGE_UI_SEED, deletingItemId: inventoryItem.id }} />
  ),
  'deleting-pending': () => (
    <ItemsPage
      uiSeed={{ ...DEFAULT_ITEMS_PAGE_UI_SEED, deletingItemId: inventoryItem.id }}
      deletePending
    />
  ),
  filtered: () => (
    <ItemsPage filtersSeed={{ ...DEFAULT_ITEMS_PAGE_FILTERS_SEED, typeFilter: 'Electronics' }} />
  ),
  'no-values': () => <ItemsPage items={inventoryItemsNoValues} />,
};

export default function ItemsScreen() {
  return <ItemsPage />;
}
