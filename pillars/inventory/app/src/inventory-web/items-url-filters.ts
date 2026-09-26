import type { WebItemsFilters } from './useWebItems.js';

/** The sort options understood by the Items and Containers list. */
export type ItemsSort = 'name' | 'updated' | 'type' | 'where';

/** The presentation options stored for an Items list. */
export type ItemsView = 'table' | 'compact' | 'cards';

/** The URL-backed segments available on the Containers list. */
export type ContainerSegment = 'all' | 'open' | 'closed' | 'full' | 'moving' | 'retired';

/** The URL state shared by the Items and Containers lists. */
export interface ItemsUrlFilters {
  readonly q: string;
  readonly typeKey: string | null;
  readonly untyped: boolean;
  readonly inactive: boolean;
  /** A location id or a container item id. */
  readonly within: string | null;
  readonly sort: ItemsSort;
  readonly view: ItemsView;
}

/** The URL state for the Containers list, including its active segment. */
export interface ContainersUrlFilters extends ItemsUrlFilters {
  readonly segment: ContainerSegment;
}

/** The default Items URL state; defaults are omitted from serialized links. */
export const DEFAULT_ITEMS_FILTERS: ItemsUrlFilters = {
  q: '',
  typeKey: null,
  untyped: false,
  inactive: false,
  within: null,
  sort: 'name',
  view: 'table',
};

const MAX_SEARCH_LENGTH = 200;

/** Search parameters owned by the Items filter hook. */
export const ITEMS_URL_KEYS = [
  'q',
  'type',
  'untyped',
  'placement',
  'inactive',
  'sort',
  'view',
] as const;

/** Search parameters owned by the Containers filter hook. */
export const CONTAINERS_URL_KEYS = [...ITEMS_URL_KEYS, 'state'] as const;

function searchText(value: string | null): string {
  return (value ?? '').trim().slice(0, MAX_SEARCH_LENGTH);
}

function nullableParam(value: string | null): string | null {
  return value === null || value.length === 0 ? null : value;
}

function readSort(value: string | null): ItemsSort {
  if (value === 'updated' || value === 'type' || value === 'where') return value;
  return 'name';
}

function readView(value: string | null): ItemsView {
  if (value === 'compact' || value === 'cards') return value;
  return 'table';
}

function readSegment(value: string | null): ContainerSegment {
  if (
    value === 'open' ||
    value === 'closed' ||
    value === 'full' ||
    value === 'moving' ||
    value === 'retired'
  ) {
    return value;
  }
  return 'all';
}

function sharedFilters(params: URLSearchParams): ItemsUrlFilters {
  const untyped = params.get('untyped') === '1';
  return {
    q: searchText(params.get('q')),
    typeKey: untyped ? null : nullableParam(params.get('type')),
    untyped,
    inactive: params.get('inactive') === '1',
    within: nullableParam(params.get('placement')),
    sort: readSort(params.get('sort')),
    view: readView(params.get('view')),
  };
}

function appendSharedSearch(
  params: URLSearchParams,
  filters: ItemsUrlFilters,
  includeInactive: boolean
): void {
  const q = searchText(filters.q);
  if (q !== '') params.set('q', q);

  if (filters.untyped) {
    params.set('untyped', '1');
  } else if (filters.typeKey !== null && filters.typeKey.length > 0) {
    params.set('type', filters.typeKey);
  }

  if (filters.within !== null && filters.within.length > 0) {
    params.set('placement', filters.within);
  }

  if (includeInactive && filters.inactive) params.set('inactive', '1');
  if (filters.sort !== 'name') params.set('sort', filters.sort);
  if (filters.view !== 'table') params.set('view', filters.view);
}

function serialized(params: URLSearchParams): string {
  const value = params.toString();
  return value === '' ? '' : `?${value}`;
}

/** Parses the Items list filters from URL search parameters. */
export function parseItemsFilters(params: URLSearchParams): ItemsUrlFilters {
  return sharedFilters(params);
}

/** Parses the Containers list filters from URL search parameters. */
export function parseContainersFilters(params: URLSearchParams): ContainersUrlFilters {
  return {
    ...sharedFilters(params),
    inactive: false,
    segment: readSegment(params.get('state')),
  };
}

/** Serializes Items filters, omitting defaults and returning an empty string or `?query`. */
export function itemsSearch(filters: ItemsUrlFilters): string {
  const params = new URLSearchParams();
  appendSharedSearch(params, filters, true);
  return serialized(params);
}

/** Serializes Containers filters, omitting defaults and returning an empty string or `?query`. */
export function containersSearch(filters: ContainersUrlFilters): string {
  const params = new URLSearchParams();
  appendSharedSearch(params, filters, false);
  if (filters.segment !== 'all') params.set('state', filters.segment);
  return serialized(params);
}

/** Maps an Items URL state to the generated `GET /web/items` query. */
export function itemsQuery(filters: ItemsUrlFilters): WebItemsFilters {
  const query: WebItemsFilters = { sort: filters.sort };
  const q = searchText(filters.q);

  if (q !== '') query.q = q;
  if (filters.untyped) query.untyped = 'true';
  else if (filters.typeKey !== null && filters.typeKey.length > 0) query.typeKey = filters.typeKey;
  if (filters.within !== null && filters.within.length > 0) query.within = filters.within;
  if (filters.inactive) query.includeInactive = true;

  return query;
}

/** Maps a Containers URL state to the generated `GET /web/items` query. */
export function containersQuery(filters: ContainersUrlFilters): WebItemsFilters {
  const query: WebItemsFilters = {
    isContainer: 'true',
    sort: filters.segment === 'moving' ? 'packing' : filters.sort,
  };
  const q = searchText(filters.q);

  if (q !== '') query.q = q;
  if (filters.untyped) query.untyped = 'true';
  else if (filters.typeKey !== null && filters.typeKey.length > 0) query.typeKey = filters.typeKey;
  if (filters.within !== null && filters.within.length > 0) query.within = filters.within;

  if (filters.segment === 'open') query.access = 'open';
  if (filters.segment === 'closed') query.access = 'closed';
  if (filters.segment === 'full') query.isFull = 'true';
  if (filters.segment === 'retired') query.lifecycle = 'retired';

  return query;
}
