import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import { isSearchDebouncing, parseSearchScope } from './search-model.js';

import type { SearchFilters, SearchScope } from './search-model.js';

const QUERY_DEBOUNCE_MS = 200;
const FILTER_DEBOUNCE_MS = 150;
const MAX_QUERY_LENGTH = 200;

/** The URL-owned state for the search route. */
export interface SearchUrlState {
  readonly query: string;
  readonly scope: SearchScope;
  readonly typeKey: string | null;
  readonly within: string | null;
  readonly selectedId: string | null;
}

/** A partial update that preserves unrelated query parameters. */
export type SearchParamPatch = Partial<{
  query: string;
  scope: SearchScope;
  typeKey: string | null;
  within: string | null;
  selectedId: string | null;
}>;

/** The debounced URL values and patch operation used by the page controller. */
export interface SearchUrlApi {
  readonly url: SearchUrlState;
  readonly debouncedQuery: string;
  readonly filters: SearchFilters;
  readonly debouncedFilters: SearchFilters;
  readonly isDebouncing: boolean;
  readonly arrivalCode: string;
  readonly patchUrl: (patch: SearchParamPatch) => void;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [delay, value]);

  return debounced;
}

function nonEmptyParam(params: URLSearchParams, key: string): string | null {
  const value = params.get(key);
  return value === null || value === '' ? null : value;
}

function readSearchUrlState(params: URLSearchParams): SearchUrlState {
  return {
    query: (params.get('q') ?? '').slice(0, MAX_QUERY_LENGTH),
    scope: parseSearchScope(params.get('scope')),
    typeKey: nonEmptyParam(params, 'type'),
    within: nonEmptyParam(params, 'placement'),
    selectedId: nonEmptyParam(params, 'selected'),
  };
}

function setOrDelete(params: URLSearchParams, key: string, value: string | null): void {
  if (value === null || value === '') params.delete(key);
  else params.set(key, value);
}

function applyQueryPatch(params: URLSearchParams, patch: SearchParamPatch): void {
  if ('query' in patch) setOrDelete(params, 'q', patch.query?.slice(0, MAX_QUERY_LENGTH) ?? null);
}

function applyScopePatch(params: URLSearchParams, patch: SearchParamPatch): void {
  if ('scope' in patch) {
    const value = patch.scope === 'inventory' ? null : (patch.scope ?? null);
    setOrDelete(params, 'scope', value);
  }
}

function applyFilterPatch(params: URLSearchParams, patch: SearchParamPatch): void {
  if ('typeKey' in patch) setOrDelete(params, 'type', patch.typeKey ?? null);
  if ('within' in patch) setOrDelete(params, 'placement', patch.within ?? null);
}

function applySelectedPatch(params: URLSearchParams, patch: SearchParamPatch): void {
  if ('selectedId' in patch) setOrDelete(params, 'selected', patch.selectedId ?? null);
}

function updateUrlState(previous: URLSearchParams, patch: SearchParamPatch): URLSearchParams {
  const next = new URLSearchParams(previous);
  applyQueryPatch(next, patch);
  applyScopePatch(next, patch);
  applyFilterPatch(next, patch);
  applySelectedPatch(next, patch);
  return next;
}

/** Owns search params, consumes arrival-only code, and applies the required debounce windows. */
export function useSearchUrlState(): SearchUrlApi {
  const [params, setSearchParams] = useSearchParams();
  const url = useMemo(() => readSearchUrlState(params), [params]);
  const [arrivalCode] = useState(() => params.get('code')?.trim() ?? '');
  const arrivalHandled = useRef(false);
  const patchUrl = useCallback(
    (patch: SearchParamPatch): void => {
      setSearchParams((previous) => updateUrlState(previous, patch), { replace: true });
    },
    [setSearchParams]
  );

  useEffect(() => {
    if (arrivalHandled.current || arrivalCode === '') return;
    arrivalHandled.current = true;
    setSearchParams(
      (previous) => {
        const existingQuery = previous.get('q')?.trim() ?? '';
        const next = updateUrlState(previous, {
          query: existingQuery === '' ? arrivalCode : (previous.get('q') ?? ''),
        });
        next.delete('code');
        return next;
      },
      { replace: true }
    );
  }, [arrivalCode, setSearchParams]);

  const debouncedQuery = useDebouncedValue(url.query, QUERY_DEBOUNCE_MS);
  const filters = useMemo<SearchFilters>(
    () => ({ typeKey: url.typeKey, within: url.within }),
    [url.typeKey, url.within]
  );
  const debouncedFilters = useDebouncedValue(filters, FILTER_DEBOUNCE_MS);
  return {
    url,
    debouncedQuery,
    filters,
    debouncedFilters,
    isDebouncing: isSearchDebouncing(url.query, debouncedQuery, filters, debouncedFilters),
    arrivalCode,
    patchUrl,
  };
}
