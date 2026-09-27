import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

import { useDebouncedValue } from '@pops/ui';

import { useSelection } from '../../foundation/selection/use-selection.js';
import { LOCATION_TREE_QUERY_KEY, WEB_ITEMS_QUERY_KEY } from '../../inventory-web/queryKeys.js';
import { useChangedElsewhere } from '../../inventory-web/useChangedElsewhere.js';
import {
  useAllConnections,
  useConnectionMutations,
  useConnectionsRegistry,
} from '../../inventory-web/useConnectionsRegistry.js';
import { useOnline } from '../../inventory-web/useOnline.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { connectionItemIds, connectionRows, type ConnectionRow } from './connection-model.js';
import { traceChain } from './connection-trace.js';
import {
  parseConnectionKind,
  parseConnectionsUrl,
  useCommittedSnapshot,
  type ConnectionKind,
  type ConnectionView,
  type ConnectionsUrlPatch,
  type ConnectionsUrlState,
  writeConnectionsUrl,
} from './connections-url.js';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';

const CONNECTIONS_QUERY_KEY = ['inventory', 'connections'] as const;

/** The data and URL controls consumed by the Connections page. */
export interface ConnectionsPageModel {
  readonly url: ConnectionsUrlState;
  readonly queryDraft: string;
  readonly kindDraft: ConnectionKind;
  readonly registry: ReturnType<typeof useConnectionsRegistry>;
  readonly resolvedRows: ConnectionRow[];
  readonly allConnections: ReturnType<typeof useAllConnections>;
  readonly resolvedAllRows: ConnectionRow[];
  readonly placement: ReturnType<typeof usePlacementSources>;
  readonly world: PlacementWorld;
  readonly online: boolean;
  readonly changed: ReturnType<typeof useChangedElsewhere>;
  readonly selection: ReturnType<typeof useSelection>;
  readonly mutations: ReturnType<typeof useConnectionMutations>;
  readonly narrowed: boolean;
  readonly total: number | null;
  readonly trace: ReturnType<typeof traceChain>;
  readonly initialLoading: boolean;
  readonly readError: boolean;
  readonly registryFiltering: boolean;
  readonly setQueryDraft: (value: string) => void;
  readonly setKindDraft: (value: ConnectionKind) => void;
  readonly setView: (value: ConnectionView) => void;
  readonly setTrace: (value: string | null) => void;
  readonly clearFilters: () => void;
  readonly retry: () => void;
}

function useConnectionsUrlState(): {
  readonly url: ConnectionsUrlState;
  readonly queryDraft: string;
  readonly kindDraft: ConnectionKind;
  readonly setQueryDraft: (value: string) => void;
  readonly setKindDraft: (value: ConnectionKind) => void;
  readonly setView: (value: ConnectionView) => void;
  readonly setTrace: (value: string | null) => void;
  readonly clearFilters: () => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const url = parseConnectionsUrl(searchParams);

  const write = useCallback(
    (patch: ConnectionsUrlPatch): void => {
      setSearchParams((current) => writeConnectionsUrl(current, patch), { replace: true });
    },
    [setSearchParams]
  );
  const setQueryDraft = useCallback((value: string): void => write({ q: value }), [write]);
  const setKindDraft = useCallback(
    (value: ConnectionKind): void => write({ kind: value }),
    [write]
  );
  const setView = useCallback((value: ConnectionView): void => write({ view: value }), [write]);
  const setTrace = useCallback((value: string | null): void => write({ trace: value }), [write]);
  const clearFilters = useCallback((): void => write({ q: '', kind: 'all' }), [write]);

  return {
    url,
    queryDraft: url.q,
    kindDraft: url.kind,
    setQueryDraft,
    setKindDraft,
    setView,
    setTrace,
    clearFilters,
  };
}

interface ConnectionSources {
  readonly registry: ReturnType<typeof useConnectionsRegistry>;
  readonly allConnections: ReturnType<typeof useAllConnections>;
  readonly placement: ReturnType<typeof usePlacementSources>;
}

function useConnectionSources(query: string, kind: ConnectionKind): ConnectionSources {
  const registry = useConnectionsRegistry({ kind, q: query });
  const allConnections = useAllConnections();
  const placementSubject = useMemo(
    () => ({ kind: 'items' as const, ids: connectionItemIds(allConnections.rows) }),
    [allConnections.rows]
  );
  const placement = usePlacementSources(placementSubject);
  return { registry, allConnections, placement };
}

interface ResolvedConnectionSources extends ConnectionSources {
  readonly resolvedRows: ConnectionRow[];
  readonly resolvedAllRows: ConnectionRow[];
  readonly world: PlacementWorld;
  readonly allReady: boolean;
  readonly readError: boolean;
  readonly initialLoading: boolean;
  readonly registryFiltering: boolean;
  readonly total: number | null;
}

function useResolvedConnectionSources(sources: ConnectionSources): ResolvedConnectionSources {
  const { allConnections, placement, registry } = sources;
  const placementReady = !placement.isLoading && !placement.isError;
  const allReady =
    allConnections.status === 'success' &&
    !allConnections.hasNextPage &&
    !allConnections.isFetchingNextPage;
  const readError =
    registry.status === 'error' || allConnections.status === 'error' || placement.isError;
  const readSuccess = registry.status === 'success' && allReady && placementReady;
  const world = useCommittedSnapshot(placement.world, placementReady);
  const hasLoaded = useCommittedSnapshot(readSuccess, readSuccess);
  const resolvedRows = useMemo(() => connectionRows(registry.rows, world), [registry.rows, world]);
  const resolvedAllRows = useMemo(
    () => connectionRows(allConnections.rows, world),
    [allConnections.rows, world]
  );

  return {
    ...sources,
    resolvedRows,
    resolvedAllRows,
    world,
    allReady,
    readError,
    initialLoading: !hasLoaded && !readError,
    registryFiltering: hasLoaded && registry.status === 'pending',
    total: allConnections.summary?.connections ?? null,
  };
}

/** Reads the Connections page, URL state, placement world, and mutation APIs. */
export function useConnectionsPageModel(): ConnectionsPageModel {
  const urlState = useConnectionsUrlState();
  const debouncedQuery = useDebouncedValue(urlState.url.q, 200);
  const debouncedKind = useDebouncedValue(urlState.url.kind, 150);
  const sources = useConnectionSources(debouncedQuery, parseConnectionKind(debouncedKind));
  const resolved = useResolvedConnectionSources(sources);
  const online = useOnline();
  const mutations = useConnectionMutations();
  const queryClient = useQueryClient();
  const selection = useSelection(resolved.resolvedRows.map((row) => row.id));
  const changed = useChangedElsewhere({
    queryKeys: [CONNECTIONS_QUERY_KEY],
    enabled: !resolved.initialLoading,
  });
  const trace = useMemo(
    () =>
      urlState.url.trace === null || sources.allConnections.status !== 'success'
        ? null
        : traceChain(urlState.url.trace, resolved.resolvedAllRows, resolved.world),
    [resolved.resolvedAllRows, resolved.world, sources.allConnections.status, urlState.url.trace]
  );
  const retry = useCallback((): void => {
    resolved.registry.refetch();
    void queryClient.invalidateQueries({ queryKey: CONNECTIONS_QUERY_KEY });
    if (resolved.placement.isError) {
      void queryClient.invalidateQueries({ queryKey: LOCATION_TREE_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: WEB_ITEMS_QUERY_KEY });
    }
  }, [queryClient, resolved.placement.isError, resolved.registry]);

  return {
    ...urlState,
    ...resolved,
    online,
    changed,
    selection,
    mutations,
    narrowed: urlState.url.q.trim().length > 0 || urlState.url.kind !== 'all',
    trace,
    retry,
  };
}
