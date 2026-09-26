import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import {
  CONTAINERS_URL_KEYS,
  DEFAULT_ITEMS_FILTERS,
  ITEMS_URL_KEYS,
  containersSearch,
  parseContainersFilters,
  parseItemsFilters,
  itemsSearch,
} from './items-url-filters.js';

import type { ContainersUrlFilters, ItemsUrlFilters } from './items-url-filters.js';

/** The URL and debounced query state exposed by an inventory list filter hook. */
export interface UrlFiltersApi<F extends ItemsUrlFilters> {
  /** What the controls show: the current URL state. */
  readonly filters: F;
  /** What the list queries with after the search or filter debounce. */
  readonly queryFilters: F;
  /** Merges a filter patch into the URL without touching unrelated parameters. */
  readonly setFilters: (patch: Partial<F>) => void;
  /** Clears narrowing filters while retaining search, sort, view, and segment state. */
  readonly clearFilters: () => void;
}

interface UrlFiltersConfig<F extends ItemsUrlFilters> {
  readonly parse: (params: URLSearchParams) => F;
  readonly search: (filters: F) => string;
  readonly ownedKeys: readonly string[];
  readonly merge: (current: F, patch: Partial<F>) => F;
  readonly clear: (current: F) => F;
}

const ITEMS_CONFIG: UrlFiltersConfig<ItemsUrlFilters> = {
  parse: parseItemsFilters,
  search: itemsSearch,
  ownedKeys: ITEMS_URL_KEYS,
  merge: (current, patch) => {
    const next = { ...current, ...patch };
    return {
      q: next.q ?? '',
      typeKey: next.typeKey ?? null,
      untyped: next.untyped ?? false,
      inactive: next.inactive ?? false,
      within: next.within ?? null,
      sort: next.sort ?? DEFAULT_ITEMS_FILTERS.sort,
      view: next.view ?? DEFAULT_ITEMS_FILTERS.view,
    };
  },
  clear: (current) => ({
    ...current,
    typeKey: null,
    untyped: false,
    inactive: false,
    within: null,
  }),
};

const CONTAINERS_CONFIG: UrlFiltersConfig<ContainersUrlFilters> = {
  parse: parseContainersFilters,
  search: containersSearch,
  ownedKeys: CONTAINERS_URL_KEYS,
  merge: (current, patch) => {
    const next = { ...current, ...patch };
    return {
      q: next.q ?? '',
      typeKey: next.typeKey ?? null,
      untyped: next.untyped ?? false,
      inactive: false,
      within: next.within ?? null,
      sort: next.sort ?? DEFAULT_ITEMS_FILTERS.sort,
      view: next.view ?? DEFAULT_ITEMS_FILTERS.view,
      segment: next.segment ?? 'all',
    };
  },
  clear: (current) => ({
    ...current,
    typeKey: null,
    untyped: false,
    inactive: false,
    within: null,
  }),
};

function withOwnedSearch(
  previous: URLSearchParams,
  search: string,
  ownedKeys: readonly string[]
): URLSearchParams {
  const next = new URLSearchParams(previous);
  for (const key of ownedKeys) next.delete(key);

  const owned = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const [key, value] of owned) next.set(key, value);
  return next;
}

function useUrlFilters<F extends ItemsUrlFilters>(config: UrlFiltersConfig<F>): UrlFiltersApi<F> {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = config.parse(searchParams);
  const filterSearch = config.search(filters);
  const [queryFilters, setQueryFilters] = useState(filters);
  const previousFilters = useRef(filters);

  useEffect(() => {
    const previous = previousFilters.current;
    previousFilters.current = filters;
    if (config.search(previous) === filterSearch) return;

    const delay = 150;
    const timer = setTimeout(() => setQueryFilters(filters), delay);
    return () => clearTimeout(timer);
  }, [config, filterSearch, filters]);

  const setFilters = useCallback(
    (patch: Partial<F>) => {
      setSearchParams(
        (previous) => {
          const current = config.parse(previous);
          const next = config.merge(current, patch);
          return withOwnedSearch(previous, config.search(next), config.ownedKeys);
        },
        { replace: true }
      );
    },
    [config, setSearchParams]
  );

  const clearFilters = useCallback(() => {
    setSearchParams(
      (previous) => {
        const current = config.parse(previous);
        return withOwnedSearch(previous, config.search(config.clear(current)), config.ownedKeys);
      },
      { replace: true }
    );
  }, [config, setSearchParams]);

  return { filters, queryFilters, setFilters, clearFilters };
}

/** Reads and writes the URL-backed Items list filters. */
export function useItemsUrlFilters(): UrlFiltersApi<ItemsUrlFilters> {
  return useUrlFilters(ITEMS_CONFIG);
}

/** Reads and writes the URL-backed Containers list filters and segment. */
export function useContainersUrlFilters(): UrlFiltersApi<ContainersUrlFilters> {
  return useUrlFilters(CONTAINERS_CONFIG);
}
