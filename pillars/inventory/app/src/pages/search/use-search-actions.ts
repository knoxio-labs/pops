import { useSearchNavigation } from './search-navigation-actions.js';
import { useSearchBulkActions } from './use-search-bulk-actions.js';

import type { SearchResultsState } from './use-search-results.js';
import type { SearchParamPatch, SearchUrlState } from './use-search-url.js';

/** Search actions shared by result rows, previews, and the selection dock. */
export interface SearchActionsState
  extends ReturnType<typeof useSearchNavigation>, ReturnType<typeof useSearchBulkActions> {}

/** Wires URL navigation, keyboard controls, item verbs, and placement moves. */
export function useSearchActions(
  url: SearchUrlState,
  patchUrl: (patch: SearchParamPatch) => void,
  results: SearchResultsState,
  activeId: string | null
): SearchActionsState {
  const navigation = useSearchNavigation(url, patchUrl, results, activeId);
  const bulk = useSearchBulkActions(results);
  return { ...navigation, ...bulk };
}
