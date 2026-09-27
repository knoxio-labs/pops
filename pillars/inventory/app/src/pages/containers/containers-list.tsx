import { ItemsTable } from '../../foundation/items-table/items-table.js';
import { isNarrowed } from '../../foundation/list-page/list-filters.js';
import {
  EmptyFiltered,
  EmptyInventory,
  ListError,
  ListSkeleton,
} from '../../foundation/list-page/list-states.js';
import { carriedCount } from '../../foundation/list-page/selection-actions.js';
import { SelectionBar } from '../../foundation/selection/selection-bar.js';
import { HoldsContentCountsProvider, holdsSecondColumn } from './holds-cell.js';

import type { ReactElement } from 'react';

import type { ContainersPageModel } from './containers-page-model.js';

function emptyState(model: ContainersPageModel): ReactElement | null {
  const total = model.itemRows.total ?? 0;
  const baseline = model.itemRows.unfilteredTotal ?? 0;
  const hiddenInactive = model.itemRows.hiddenInactiveCount ?? 0;
  const noContainers =
    baseline === 0 &&
    hiddenInactive === 0 &&
    !isNarrowed(model.filters.filters) &&
    model.summary.data !== undefined &&
    model.summary.data.containerSegments.all + model.summary.data.containerSegments.retired === 0;
  if (noContainers) {
    return <EmptyInventory noun="containers" onNavigate={model.navigate} offline={!model.online} />;
  }
  if (total === 0) return <EmptyFiltered noun="containers" onClear={model.filters.clearFilters} />;
  return null;
}

function ContainersTable({ model }: { model: ContainersPageModel }): ReactElement {
  return (
    <HoldsContentCountsProvider counts={model.itemRows.contentCounts}>
      <ItemsTable
        label="containers"
        rows={model.itemRows.rows}
        total={model.itemRows.total ?? 0}
        world={model.world}
        selection={model.selection}
        sort={model.filters.filters.sort}
        onSort={(sort) => model.filters.setFilters({ sort })}
        pendingIds={model.pendingIds}
        rejections={model.rejections}
        secondColumn={holdsSecondColumn}
        onOpen={model.openItem}
        onLoadMore={model.itemRows.fetchNextPage}
      />
    </HoldsContentCountsProvider>
  );
}

/** Renders loading, error, empty, and table states for container rows. */
export function ContainersBody({ model }: { model: ContainersPageModel }): ReactElement {
  const { itemRows, summary } = model;
  if (itemRows.status === 'pending' || summary.status === 'pending') {
    return <ListSkeleton label="Loading containers" />;
  }
  if (itemRows.status === 'error' || summary.status === 'error' || summary.data === undefined) {
    return <ListError noun="containers" onRetry={model.retry} />;
  }
  return emptyState(model) ?? <ContainersTable model={model} />;
}

/** Renders the selection bar and its container verbs. */
export function ContainersSelectionBar({ model }: { model: ContainersPageModel }): ReactElement {
  return (
    <SelectionBar
      count={model.selection.count}
      loadedCount={model.itemRows.rows.length}
      coverage={model.selection.coverage}
      actions={model.selectionActions}
      carriedCount={carriedCount(
        model.selection.selectedIds,
        model.itemRows.contentCounts,
        model.world
      )}
      onSelectAll={model.selection.onHeaderToggle}
      onClear={model.selection.clearSelection}
    />
  );
}
