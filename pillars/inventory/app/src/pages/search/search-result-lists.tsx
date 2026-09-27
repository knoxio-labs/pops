import { ResultsList, PurchasesList } from './results-list.js';

import type { SearchPageState } from './use-search-page.js';

/** Renders the active scope's listbox after the request has settled with results. */
export function SearchResultLists({ state }: { readonly state: SearchPageState }) {
  if (state.scope === 'purchases') {
    return (
      <PurchasesList
        query={state.debouncedQuery}
        hits={state.purchases.hits}
        activeId={state.activeId}
        onKeyDown={state.onListKeyDown}
        onActivate={state.activate}
        onOpen={state.openResult}
      />
    );
  }
  return (
    <ResultsList
      query={state.debouncedQuery}
      results={state.inventory.results}
      world={state.world}
      activeId={state.activeId}
      checkedIds={new Set(state.selection.selectedIds)}
      hasNextPage={state.inventory.hasNextPage}
      isFetchingNextPage={state.inventory.isFetchingNextPage}
      onKeyDown={state.onListKeyDown}
      onActivate={state.activate}
      onOpen={state.openResult}
      onToggle={state.selection.onRowToggle}
      onPickUp={state.pickUp}
      onPutBack={state.putBack}
      onMove={state.openMoveFor}
      onFetchNextPage={state.inventory.fetchNextPage}
    />
  );
}
