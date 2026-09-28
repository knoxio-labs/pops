import { ItemsTable } from '../../foundation/items-table/items-table.js';
import { isNarrowed } from '../../foundation/list-page/list-filters.js';
import {
  EmptyFiltered,
  EmptyInventory,
  ListError,
  ListSkeleton,
} from '../../foundation/list-page/list-states.js';
import { HoldsContentCountsProvider, holdsSecondColumn } from './holds-cell.js';

import type { ReactElement } from 'react';

import type { ListVerbs } from '../../foundation/list-page/use-list-verbs.js';
import type { ContainersPageModel } from './containers-page-model.js';

function isEmptyInventory(model: ContainersPageModel): boolean {
  const total = model.itemRows.total ?? 0;
  const baseline = model.itemRows.unfilteredTotal ?? 0;
  const hiddenInactive = model.itemRows.hiddenInactiveCount ?? 0;
  if (total !== 0 || baseline !== 0 || hiddenInactive !== 0) return false;
  if (model.summary.data !== undefined) {
    return (
      !isNarrowed(model.filters.filters) &&
      model.summary.data.containerSegments.all + model.summary.data.containerSegments.retired === 0
    );
  }
  return !isNarrowed(model.filters.filters) && model.filters.filters.segment === 'all';
}

function emptyState(model: ContainersPageModel): ReactElement | null {
  const total = model.itemRows.total ?? 0;
  if (isEmptyInventory(model)) {
    return <EmptyInventory noun="containers" onNavigate={model.navigate} offline={!model.online} />;
  }
  if (total === 0) return <EmptyFiltered noun="containers" onClear={model.filters.clearFilters} />;
  return null;
}

function ContainersTable({
  model,
  rejections,
  onRowVerb,
}: {
  model: ContainersPageModel;
  rejections: ListVerbs['rejections'];
  onRowVerb: ListVerbs['onRowVerb'];
}): ReactElement {
  const moving = model.filters.filters.segment === 'moving';
  return (
    <HoldsContentCountsProvider counts={model.itemRows.contentCounts}>
      <ItemsTable
        label="containers"
        rows={model.itemRows.rows}
        total={model.itemRows.total ?? 0}
        world={model.world}
        selection={model.selection}
        sort={moving ? undefined : model.filters.filters.sort}
        onSort={moving ? undefined : (sort) => model.filters.setFilters({ sort })}
        pendingIds={model.pendingIds}
        rejections={rejections}
        secondColumn={holdsSecondColumn}
        onOpen={model.openItem}
        onRowVerb={onRowVerb}
        onLoadMore={model.itemRows.fetchNextPage}
      />
    </HoldsContentCountsProvider>
  );
}

/** Renders loading, error, empty, and table states for container rows. */
export function ContainersBody({
  model,
  rejections,
  onRowVerb,
}: {
  model: ContainersPageModel;
  rejections: ListVerbs['rejections'];
  onRowVerb: ListVerbs['onRowVerb'];
}): ReactElement {
  const { itemRows, summary } = model;
  if (itemRows.status === 'pending' || summary.status === 'pending') {
    return <ListSkeleton label="Loading containers" />;
  }
  if (itemRows.status === 'error') {
    return <ListError noun="containers" onRetry={model.retry} />;
  }
  if (summary.status === 'error' || summary.data === undefined) {
    if (isEmptyInventory(model)) {
      return (
        <EmptyInventory noun="containers" onNavigate={model.navigate} offline={!model.online} />
      );
    }
    if ((model.itemRows.total ?? 0) === 0) {
      return <EmptyFiltered noun="containers" onClear={model.filters.clearFilters} />;
    }
    return <ListError noun="containers" onRetry={model.retry} />;
  }
  return (
    emptyState(model) ?? (
      <ContainersTable model={model} rejections={rejections} onRowVerb={onRowVerb} />
    )
  );
}
