import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';

import { InventoryApiError, unwrap } from '../inventory-api-helpers.js';
import {
  connectionsConnect,
  connectionsDisconnect,
  fixturesConnect,
  fixturesDisconnect,
  webConnectionsList,
} from '../inventory-api/index.js';
import { markConnectionsWrittenHere } from './useConnectionsChanged.js';

import type { QueryClient } from '@tanstack/react-query';

import type {
  WebConnectionsListData,
  WebConnectionsListResponse,
} from '../inventory-api/types.gen.js';

/** The cache-key root for the paged connection registry. */
export const CONNECTIONS_REGISTRY_QUERY_KEY = ['inventory', 'connections', 'registry'] as const;

/** One resolved item or fixture connection returned by the registry endpoint. */
export type WebConnectionRow = WebConnectionsListResponse['rows'][number];

/** The server-side filters accepted by the connection registry. */
export interface ConnectionsFilter {
  readonly kind: 'all' | 'item' | 'fixture';
  readonly q: string;
}

/** Paged connection registry data and controls for the Connections page. */
export interface ConnectionsRegistry {
  readonly rows: WebConnectionRow[];
  /** The summary from the first page, or null before the first page loads. */
  readonly summary: WebConnectionsListResponse['summary'] | null;
  readonly status: 'pending' | 'error' | 'success';
  readonly error: InventoryApiError | null;
  readonly hasNextPage: boolean;
  readonly fetchNextPage: () => void;
  readonly refetch: () => void;
}

/** The mutation operations shared by connection and fixture pages. */
export interface ConnectionMutations {
  readonly connectItems: (itemAId: string, itemBId: string) => Promise<void>;
  readonly connectFixture: (itemId: string, fixtureId: string) => Promise<void>;
  /** Disconnect an item from a fixture through the fixture-specific route. */
  readonly disconnectFixture: (itemId: string, fixtureId: string) => Promise<void>;
  /** Routes item rows and fixture rows to their respective disconnect endpoints. */
  readonly disconnect: (row: WebConnectionRow) => Promise<void>;
}

const REGISTRY_PAGE_LIMIT = 200;
const CONNECTIONS_QUERY_KEY = ['inventory', 'connections'] as const;
const FIXTURES_QUERY_KEY = ['inventory', 'fixtures'] as const;
const WEB_QUERY_KEY = ['inventory', 'web'] as const;
const EMPTY_PAGES: readonly WebConnectionsListResponse[] = [];

function queryKey(filter: ConnectionsFilter): readonly unknown[] {
  return [...CONNECTIONS_REGISTRY_QUERY_KEY, { kind: filter.kind, q: filter.q.trim() }] as const;
}

function registryQuery(
  filter: ConnectionsFilter,
  cursor: string | undefined
): WebConnectionsListData['query'] {
  const query: WebConnectionsListData['query'] = {
    kind: filter.kind,
    limit: REGISTRY_PAGE_LIMIT,
    cursor,
  };
  const q = filter.q.trim();
  if (q.length > 0) query.q = q;
  return query;
}

function useRegistryQuery(filter: ConnectionsFilter) {
  return useInfiniteQuery({
    queryKey: queryKey(filter),
    queryFn: async ({ pageParam, signal }) =>
      unwrap(
        await webConnectionsList({
          query: registryQuery(filter, pageParam),
          signal,
        })
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

/** Reads the filtered, cursor-paged connection registry without client-side filtering. */
export function useConnectionsRegistry(filter: ConnectionsFilter): ConnectionsRegistry {
  const registry = useRegistryQuery(filter);
  const { fetchNextPage: fetchRegistryNextPage, hasNextPage, refetch: refetchRegistry } = registry;
  const pages = registry.data?.pages ?? EMPTY_PAGES;
  const fetchNextPage = useCallback((): void => {
    void fetchRegistryNextPage();
  }, [fetchRegistryNextPage]);
  const refetch = useCallback((): void => {
    void refetchRegistry();
  }, [refetchRegistry]);

  return {
    rows: pages.flatMap((page) => page.rows),
    summary: pages[0]?.summary ?? null,
    status: registry.status,
    error: registry.error instanceof InventoryApiError ? registry.error : null,
    hasNextPage,
    fetchNextPage,
    refetch,
  };
}

/** Loads every unfiltered registry page for the graph and trace views. */
export function useAllConnections(): Pick<ConnectionsRegistry, 'rows' | 'status' | 'error'> {
  const { error, fetchNextPage, hasNextPage, rows, status } = useConnectionsRegistry({
    kind: 'all',
    q: '',
  });

  useEffect(() => {
    if (hasNextPage) fetchNextPage();
  }, [fetchNextPage, hasNextPage]);

  return { rows, status, error };
}

async function invalidateConnectionQueries(queryClient: QueryClient): Promise<void> {
  await Promise.allSettled([
    queryClient.invalidateQueries({ queryKey: CONNECTIONS_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: FIXTURES_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: WEB_QUERY_KEY }),
  ]);
}

/** Connects or disconnects registry rows and refreshes every affected cache family. */
export function useConnectionMutations(): ConnectionMutations {
  const queryClient = useQueryClient();
  const runWrite = useCallback(
    async (write: () => Promise<unknown>): Promise<void> => {
      await write();
      markConnectionsWrittenHere();
      await invalidateConnectionQueries(queryClient);
    },
    [queryClient]
  );

  const connectItems = useCallback(
    (itemAId: string, itemBId: string): Promise<void> =>
      runWrite(async () => {
        await unwrap(await connectionsConnect({ body: { itemAId, itemBId } }));
      }),
    [runWrite]
  );
  const connectFixture = useCallback(
    (itemId: string, fixtureId: string): Promise<void> =>
      runWrite(async () => {
        await unwrap(await fixturesConnect({ path: { itemId, fixtureId } }));
      }),
    [runWrite]
  );
  const disconnectFixture = useCallback(
    (itemId: string, fixtureId: string): Promise<void> =>
      runWrite(async () => {
        await unwrap(await fixturesDisconnect({ path: { itemId, fixtureId } }));
      }),
    [runWrite]
  );
  const disconnect = useCallback(
    (row: WebConnectionRow): Promise<void> => {
      if (row.far.kind === 'fixture') return disconnectFixture(row.item.id, row.far.id);
      return runWrite(async () => {
        await unwrap(
          await connectionsDisconnect({
            query: { itemAId: row.item.id, itemBId: row.far.id },
          })
        );
      });
    },
    [disconnectFixture, runWrite]
  );

  return { connectItems, connectFixture, disconnectFixture, disconnect };
}
