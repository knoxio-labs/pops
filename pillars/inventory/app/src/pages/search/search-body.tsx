import { RecentsList } from './recents-list.js';
import { SearchResultLists } from './search-result-lists.js';
import { SearchErrorState, SearchLoadingState, SearchNoResultsState } from './search-states.js';

import type { SearchPageState } from './use-search-page.js';

function hasResults(state: SearchPageState): boolean {
  if (state.scope === 'purchases') return state.purchases.hits.length > 0;
  return (
    state.inventory.results.exact !== null ||
    state.inventory.results.items.length > 0 ||
    state.inventory.results.places.length > 0
  );
}

/** Chooses recents, request states, and the active result list for the page body. */
export function SearchBody({ state }: { readonly state: SearchPageState }) {
  if (state.query.trim() === '' && state.debouncedQuery.trim() === '') {
    return (
      <RecentsList
        queries={state.recents.queries}
        records={state.recents.records}
        world={state.world}
        onQuery={state.setQuery}
        onOpenRecord={(record) => {
          state.activate(record.id);
          state.openResult(record.id);
        }}
      />
    );
  }
  if (state.isDebouncing || state.status === 'pending' || state.status === 'idle') {
    return <SearchLoadingState />;
  }
  if (state.status === 'error') return <SearchErrorState onRetry={state.retry} />;
  if (!hasResults(state)) {
    return (
      <SearchNoResultsState
        scope={state.scope}
        hasFilters={state.typeKey !== null || state.within !== null}
        otherCount={state.counts[state.scope === 'inventory' ? 'purchases' : 'inventory']}
        onClearFilters={() => state.setFilters({ typeKey: null, within: null })}
        onSwitchScope={() =>
          state.setScope(state.scope === 'inventory' ? 'purchases' : 'inventory')
        }
      />
    );
  }
  return <SearchResultLists state={state} />;
}
