import { DeleteItemDialog } from './delete-item-dialog';
import { FiltersBar } from './filters-bar';
import { ItemsContent } from './items-content';
import { VIEW_STORAGE } from './items-page-types';
import { SummaryAndView } from './summary-and-view';

import type { ItemsPageCallbacks, ItemsPageOptions } from './items-page-types';
import type { useItemsPageState } from './use-items-page-state';

/** Everything below `ItemsPage`'s `PageHeader`: the filters bar, the summary/view toggle, the list itself and the delete confirmation. */
export function ItemsPageBody({
  state,
  options,
  isLoading,
  deletePending,
  callbacks,
}: {
  state: ReturnType<typeof useItemsPageState>;
  options: ItemsPageOptions;
  isLoading: boolean;
  deletePending: boolean;
  callbacks: ItemsPageCallbacks;
}) {
  return (
    <>
      <FiltersBar
        search={state.filters.search}
        typeFilter={state.filters.typeFilter}
        conditionFilter={state.filters.conditionFilter}
        inUseFilter={state.filters.inUseFilter}
        locationFilter={state.filters.locationFilter}
        typeOptions={options.typeOptions}
        locationOptions={options.locationOptions}
        hasActiveFilters={state.hasActiveFilters}
        onParamChange={state.onParamChange}
        onClearFilters={state.onClearFilters}
        onSearchKeyDown={(e) => state.handleSearchKeyDown(e, callbacks.onItemOpen)}
      />
      {!isLoading && (
        <SummaryAndView
          totalCount={state.filteredItems.length}
          totalReplacementValue={state.totalReplacementValue}
          totalResaleValue={state.totalResaleValue}
          viewMode={state.viewMode}
          onViewChange={state.setViewMode}
          storageKey={VIEW_STORAGE}
        />
      )}
      <ItemsContent
        isLoading={isLoading}
        items={state.filteredItems}
        viewMode={state.viewMode}
        hasSearchOrFilters={state.hasSearchOrFilters}
        locationPathMap={options.locationPathMap}
        onOpen={callbacks.onItemOpen}
        onEdit={callbacks.onItemEdit}
        onDeleteRequest={state.setDeletingItemId}
      />
      <DeleteItemDialog
        isOpen={state.deletingItemId !== null}
        isPending={deletePending}
        onConfirm={() => {
          if (state.deletingItemId) callbacks.onDeleteConfirm(state.deletingItemId);
        }}
        onClose={() => state.setDeletingItemId(null)}
      />
    </>
  );
}
