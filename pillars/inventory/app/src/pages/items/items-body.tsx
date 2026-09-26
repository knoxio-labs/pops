import { ItemsTable } from '../../foundation/list-page/items-table.js';
import {
  EmptyFiltered,
  EmptyInventory,
  ListError,
  ListSkeleton,
} from '../../foundation/list-page/list-states.js';
import { ItemsCards } from './items-cards.js';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { SelectionApi } from '../../foundation/selection/use-selection.js';
import type { ItemsSort, ItemsView } from '../../inventory-web/items-url-filters.js';
import type { ItemRows } from '../../inventory-web/useWebItems.js';

interface ItemsBodyProps {
  status: ItemRows['status'];
  rows: readonly ItemRowModel[];
  total: number;
  unfilteredTotal: number;
  hiddenInactiveCount: number;
  narrowed: boolean;
  view: ItemsView;
  sort: ItemsSort;
  world: PlacementWorld;
  selection: SelectionApi;
  pendingIds: ReadonlySet<string>;
  online: boolean;
  onNavigate: (path: string) => void;
  onRetry: () => void;
  onClear: () => void;
  onSort: (sort: ItemsSort) => void;
  onLoadMore: () => void;
}

/** Chooses the loading, empty, error, table, or card state for the item list. */
export function ItemsBody({
  status,
  rows,
  total,
  unfilteredTotal,
  hiddenInactiveCount,
  narrowed,
  view,
  sort,
  world,
  selection,
  pendingIds,
  online,
  onNavigate,
  onRetry,
  onClear,
  onSort,
  onLoadMore,
}: ItemsBodyProps): ReactElement {
  if (status === 'pending') return <ListSkeleton label="Loading items" />;
  if (status === 'error') return <ListError noun="items" onRetry={onRetry} />;
  if (!narrowed && unfilteredTotal === 0 && hiddenInactiveCount === 0) {
    return <EmptyInventory noun="items" onNavigate={onNavigate} offline={!online} />;
  }
  if (total === 0) return <EmptyFiltered noun="items" onClear={onClear} />;
  if (view === 'cards') {
    return (
      <ItemsCards
        rows={rows}
        total={total}
        world={world}
        selection={selection}
        onOpen={(id) => onNavigate(`/inventory/items/${id}`)}
        onLoadMore={onLoadMore}
      />
    );
  }
  return (
    <ItemsTable
      label="items"
      rows={rows}
      total={total}
      world={world}
      selection={selection}
      density={view === 'compact' ? 'compact' : 'default'}
      sort={sort}
      onSort={onSort}
      pendingIds={pendingIds}
      onOpen={(id) => onNavigate(`/inventory/items/${id}`)}
      onLoadMore={onLoadMore}
    />
  );
}
