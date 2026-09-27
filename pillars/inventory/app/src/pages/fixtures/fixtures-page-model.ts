import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import { useDebouncedValue } from '@pops/ui';

import { LOCATIONS_TREE_QUERY_KEY } from '../../inventory-web/queryKeys.js';
import { useConnectionsChanged } from '../../inventory-web/useConnectionsChanged.js';
import { useFixtures } from '../../inventory-web/useFixtures.js';
import { useOnline } from '../../inventory-web/useOnline.js';
import { useCommittedSnapshot } from '../connections/connections-url.js';
import { useLocationModels } from '../location-page/location-page-model.js';
import { fixtureFilterSearch, isFiltered, parseFixtureFilter } from './fixture-filter.js';
import { isFixtureKind } from './fixture-kinds.js';
import { useFixtureMutations } from './fixture-mutations.js';

import type { FixtureFilter } from './fixture-filter.js';
import type { FixtureKind } from './fixture-kinds.js';

export { useFixtureDetailPageModel } from './fixture-detail-model.js';
export { useFixtureMutations } from './fixture-mutations.js';
export { fixtureQueryKey } from './fixture-query-keys.js';
export type { FixtureDraft } from './fixture-form-types.js';
export type { SaveFixtureInput } from './fixture-mutations.js';

const FIXTURES_QUERY_PREFIX = ['inventory', 'fixtures'] as const;

/** Reads the raw URL query while keeping its trimmed server value separate. */
export interface FixturesFilterState {
  readonly url: FixtureFilter;
  readonly queryDraft: string;
  readonly kindDraft: FixtureKind | 'all';
  readonly filter: FixtureFilter;
  readonly serverFilter: FixtureFilter;
  readonly setQueryDraft: (value: string) => void;
  readonly setKindDraft: (value: FixtureKind | 'all') => void;
  readonly clearFilters: () => void;
}

function writeFilterUrl(
  current: URLSearchParams,
  query: string,
  kind: FixtureKind | 'all'
): URLSearchParams {
  const next = new URLSearchParams(current);
  next.delete('q');
  next.delete('kind');
  const encoded = fixtureFilterSearch({ query, kind });
  for (const [key, value] of new URLSearchParams(encoded.slice(1))) next.set(key, value);
  return next;
}

function useFixturesFilterState(): FixturesFilterState {
  const [searchParams, setSearchParams] = useSearchParams();
  const url = parseFixtureFilter(searchParams);
  const rawQuery = searchParams.get('q') ?? '';
  const [queryDraft, setQueryDraftState] = useState(rawQuery);
  const lastUrl = useRef({ query: rawQuery, kind: url.kind });

  useEffect(() => {
    if (lastUrl.current.query !== rawQuery) setQueryDraftState(rawQuery);
    lastUrl.current = { query: rawQuery, kind: url.kind };
  }, [rawQuery, url.kind]);

  const write = useCallback(
    (query: string, kind: FixtureKind | 'all'): void => {
      setSearchParams((current) => writeFilterUrl(current, query, kind), { replace: true });
    },
    [setSearchParams]
  );
  const setQueryDraft = useCallback(
    (value: string): void => {
      setQueryDraftState(value);
      write(value, url.kind);
    },
    [url.kind, write]
  );
  const setKindDraft = useCallback(
    (value: FixtureKind | 'all'): void => write(queryDraft, value),
    [queryDraft, write]
  );
  const clearFilters = useCallback((): void => {
    setQueryDraftState('');
    write('', 'all');
  }, [write]);

  const serverQuery = useDebouncedValue(url.query, 200);
  const serverKindValue = useDebouncedValue(url.kind === 'all' ? '' : url.kind, 150);
  const serverKind: FixtureKind | 'all' = isFixtureKind(serverKindValue) ? serverKindValue : 'all';

  return {
    url,
    queryDraft,
    kindDraft: url.kind,
    filter: url,
    serverFilter: { query: serverQuery, kind: serverKind },
    setQueryDraft,
    setKindDraft,
    clearFilters,
  };
}

function fixturesPageStatus(
  fixtures: ReturnType<typeof useFixtures>,
  locations: ReturnType<typeof useLocationModels>
): 'pending' | 'error' | 'success' {
  if (fixtures.error !== null || fixtures.status === 'error' || locations.status === 'error') {
    return 'error';
  }
  if (fixtures.status === 'pending' || locations.status === 'pending') return 'pending';
  return 'success';
}

/** Reads and mutates the server-backed fixture list page. */
export function useFixturesPageModel() {
  const filters = useFixturesFilterState();
  const fixtures = useFixtures({
    search: filters.serverFilter.query,
    type: filters.serverFilter.kind === 'all' ? null : filters.serverFilter.kind,
    withinLocationId: null,
  });
  const allFixtures = useFixtures({ search: '', type: null, withinLocationId: null });
  const locations = useLocationModels();
  const online = useOnline();
  const readSuccess = fixtures.status === 'success' && locations.status === 'success';
  const hasLoaded = useCommittedSnapshot(readSuccess, readSuccess);
  const changed = useConnectionsChanged({
    queryKeys: [FIXTURES_QUERY_PREFIX],
    enabled: hasLoaded,
  });
  const mutations = useFixtureMutations();
  const queryClient = useQueryClient();
  const retryLocations = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: LOCATIONS_TREE_QUERY_KEY });
  }, [queryClient]);
  const retry = useCallback((): void => {
    fixtures.refetch();
    if (isFiltered(filters.filter)) allFixtures.refetch();
    retryLocations();
  }, [allFixtures, fixtures, filters.filter, retryLocations]);

  return {
    filters,
    fixtures,
    unfilteredTotal: allFixtures.total,
    locations,
    online,
    changed,
    mutations,
    hasLoaded,
    status: fixturesPageStatus(fixtures, locations),
    retryLocations,
    retry,
  };
}
