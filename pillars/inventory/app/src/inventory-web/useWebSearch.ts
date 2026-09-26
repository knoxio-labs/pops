import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { InventoryApiError, unwrap } from '../inventory-api-helpers.js';
import { client } from '../inventory-api/client.gen.js';
import * as inventoryApi from '../inventory-api/index.js';
import { toItemRowModel } from './item-row-model.js';
import { useCatalogueLookups } from './useCatalogueLookups.js';
import { useWebSearchLocations } from './useWebSearchLocations.js';
import { searchActions, searchStatus } from './useWebSearchState.js';

import type { ItemRowModel, LocationModel } from '../foundation/model/model';

/** The cache prefix shared by every inventory web-search variant. */
export const WEB_SEARCH_QUERY_KEY = ['inventory', 'web', 'web-search'] as const;

/** Parameters accepted by the inventory web search endpoint. */
export interface WebSearchParams {
  readonly q: string;
  readonly typeKey?: string;
  /** A location id or a container item id. */
  readonly within?: string;
  /** Store here: active items only. */
  readonly activeOnly?: boolean;
  /** Items per page. The endpoint defaults to 20 and accepts 1 through 100. */
  readonly limit?: number;
}

/** The server's ranked item-match tiers. */
export type SearchTier = 'prefix' | 'contains' | 'other';

/** An item result mapped into the shared inventory row model. */
export interface SearchItemHit {
  readonly kind: 'item';
  readonly item: ItemRowModel;
  readonly tier: SearchTier;
  readonly field: 'code' | 'note' | 'type' | 'place' | null;
}

/** A place result mapped into the shared inventory location model. */
export interface SearchPlaceHit {
  readonly kind: 'place';
  readonly place: LocationModel;
  readonly tier: 'prefix' | 'contains';
}

/** Search results accumulated from the loaded pages. */
export interface WebSearchResults {
  readonly exact: ItemRowModel | null;
  readonly items: readonly SearchItemHit[];
  readonly places: readonly SearchPlaceHit[];
  readonly total: number;
}

/** The public state and controls returned by {@link useWebSearch}. */
export interface WebSearchApi {
  /** Empty while the search is idle or pending. */
  readonly results: WebSearchResults;
  readonly status: 'idle' | 'pending' | 'error' | 'success';
  /** The search request error; location-tree failures leave this null. */
  readonly error: InventoryApiError | null;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly fetchNextPage: () => void;
  readonly refetch: () => void;
}

type WebSearchItem = Parameters<typeof toItemRowModel>[0];

interface WebSearchQuery {
  readonly q: string;
  readonly typeKey?: string;
  readonly within?: string;
  readonly activeOnly?: 'true';
  readonly limit: number;
  readonly cursor?: string;
}

interface WebSearchItemHit {
  readonly item: WebSearchItem;
  readonly tier: SearchTier;
  readonly field: SearchItemHit['field'];
}

interface WebSearchPlaceHit {
  readonly location: { readonly id: string };
  readonly tier: SearchPlaceHit['tier'];
}

interface WebSearchListResponse {
  readonly exact: WebSearchItem | null;
  readonly places: readonly WebSearchPlaceHit[];
  readonly items: readonly WebSearchItemHit[];
  readonly nextCursor: string | null;
  readonly total: number;
}

type WebSearchListResponses = { 200: WebSearchListResponse };
type WebSearchListErrors = { 400: { message: string } };
type WebSearchRequestResult = {
  data?: WebSearchListResponse;
  error?: unknown;
  response?: Response;
};
type WebSearchRequestOptions = { query: WebSearchQuery; signal: AbortSignal };
type WebSearchList = (options: WebSearchRequestOptions) => Promise<WebSearchRequestResult>;
type InventoryApiWithWebSearch = typeof inventoryApi & { webSearchList: WebSearchList };

const DEFAULT_LIMIT = 20;
const EMPTY_DELETED_PREVIOUS_PLACES = new Map<string, string>();
const EMPTY_RESULTS: WebSearchResults = {
  exact: null,
  items: [],
  places: [],
  total: 0,
};

function hasWebSearchList(api: typeof inventoryApi): api is InventoryApiWithWebSearch {
  return 'webSearchList' in api && typeof api.webSearchList === 'function';
}

function requestWebSearch(options: WebSearchRequestOptions): Promise<WebSearchRequestResult> {
  if (hasWebSearchList(inventoryApi)) return inventoryApi.webSearchList(options);

  return client.get<WebSearchListResponses, WebSearchListErrors>({
    url: '/web/search',
    query: { ...options.query },
    signal: options.signal,
  });
}

function useTypeNames(): ReadonlyMap<string, string> {
  return useCatalogueLookups().typeNameById;
}

function mapItem(item: WebSearchItem, typeNames: ReadonlyMap<string, string>): ItemRowModel | null {
  const row: ItemRowModel | null = toItemRowModel(item, {
    typeNames,
    deletedPreviousPlaces: EMPTY_DELETED_PREVIOUS_PLACES,
  });
  return row;
}

function mapResults(
  pages: readonly WebSearchListResponse[],
  typeNames: ReadonlyMap<string, string>,
  locationsById: ReadonlyMap<string, LocationModel>
): WebSearchResults {
  const firstPage = pages[0];
  const exact =
    firstPage?.exact === null || firstPage?.exact === undefined
      ? null
      : mapItem(firstPage.exact, typeNames);
  const items = pages.flatMap((page) =>
    page.items.flatMap((hit): SearchItemHit[] => {
      const item = mapItem(hit.item, typeNames);
      return item === null ? [] : [{ kind: 'item', item, tier: hit.tier, field: hit.field }];
    })
  );
  const places = (firstPage?.places ?? []).flatMap((hit): SearchPlaceHit[] => {
    const place = locationsById.get(hit.location.id);
    return place === undefined ? [] : [{ kind: 'place', place, tier: hit.tier }];
  });

  return {
    exact,
    items,
    places,
    total: firstPage?.total ?? 0,
  };
}

function useWebSearchQuery(q: string, params: WebSearchParams) {
  const limit = params.limit ?? DEFAULT_LIMIT;
  const queryParams = {
    q,
    typeKey: params.typeKey,
    within: params.within,
    activeOnly: params.activeOnly,
    limit,
  } as const;
  return useInfiniteQuery({
    queryKey: [...WEB_SEARCH_QUERY_KEY, queryParams] as const,
    queryFn: async ({ pageParam, signal }) =>
      unwrap(
        await requestWebSearch({
          query: {
            q,
            ...(params.typeKey === undefined ? {} : { typeKey: params.typeKey }),
            ...(params.within === undefined ? {} : { within: params.within }),
            ...(params.activeOnly === true ? { activeOnly: 'true' as const } : {}),
            limit,
            cursor: pageParam,
          },
          signal,
        })
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: q.length > 0,
    refetchOnWindowFocus: false,
  });
}

/**
 * Searches inventory through `GET /web/search`, mapping ranked hits to the
 * shared row and location models while retaining the server pages in React
 * Query's cache for verb invalidation.
 */
export function useWebSearch(params: WebSearchParams): WebSearchApi {
  const q = params.q.trim();
  const typeNames = useTypeNames();
  const locationModels = useWebSearchLocations();
  const locationsById = useMemo(
    () => new Map(locationModels.locations.map((location) => [location.id, location] as const)),
    [locationModels.locations]
  );
  const search = useWebSearchQuery(q, params);
  const searchError = search.error instanceof InventoryApiError ? search.error : null;
  const status = searchStatus(q, search.status, locationModels.status);
  const mappedResults = useMemo(
    () => mapResults(search.data?.pages ?? [], typeNames, locationsById),
    [locationsById, search.data, typeNames]
  );

  return {
    results: status === 'idle' || status === 'pending' ? EMPTY_RESULTS : mappedResults,
    status,
    error: searchError,
    ...searchActions(search),
  };
}
