import { PLACEMENT_SOURCES_QUERY_KEY, WEB_ITEMS_QUERY_KEY } from './queryKeys.js';
import { WEB_SEARCH_QUERY_KEY } from './useWebSearch.js';

import type { QueryClient } from '@tanstack/react-query';

import type { WebPlacementSourcesResponses } from '../inventory-api/types.gen.js';
import type { WebItem } from './item-row-model.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type PlacementSource = WebPlacementSourcesResponses[200]['items'][number];

const isItemRecord = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && typeof value.id === 'string' && isRecord(value.placement);

const isWebItem = (value: unknown): value is WebItem =>
  isItemRecord(value) &&
  typeof value.revision === 'number' &&
  typeof value.seq === 'number' &&
  Array.isArray(value.fieldValues) &&
  Array.isArray(value.computedValues);

function placementSource(item: WebItem): PlacementSource {
  return {
    id: item.id,
    name: item.name,
    typeId: item.typeId,
    typeKey: item.typeKey,
    legacyType: item.legacyType,
    note: item.note,
    code: item.code,
    quantity: item.quantity,
    lifecycle: item.lifecycle,
    placement: item.placement,
    previousPlacement: item.previousPlacement,
    isContainer: item.isContainer,
    access: item.access,
    isFull: item.isFull,
    updatedAt: item.updatedAt,
  };
}

const hasPrefix = (key: readonly unknown[], prefix: readonly unknown[]): boolean =>
  prefix.every((part, index) => key[index] === part);

/** True when a query key stores a web item or a web item-derived search result. */
export const isWebItemQuery = (key: readonly unknown[]): boolean =>
  hasPrefix(key, WEB_SEARCH_QUERY_KEY) ||
  hasPrefix(key, PLACEMENT_SOURCES_QUERY_KEY) ||
  (hasPrefix(key, WEB_ITEMS_QUERY_KEY) && typeof key[WEB_ITEMS_QUERY_KEY.length] === 'string');

function visitItems(value: unknown, visit: (item: WebItem) => void): void {
  if (isWebItem(value)) return void visit(value);
  if (Array.isArray(value)) return void value.forEach((entry) => visitItems(entry, visit));
  if (isRecord(value)) for (const child of Object.values(value)) visitItems(child, visit);
}

function replaceItems(value: unknown, id: string, replacement: WebItem): unknown {
  if (isWebItem(value)) return value.id === id ? replacement : value;
  if (isItemRecord(value)) return value.id === id ? placementSource(replacement) : value;
  if (Array.isArray(value)) {
    const next = value.map((entry) => replaceItems(entry, id, replacement));
    return next.some((entry, index) => entry !== value[index]) ? next : value;
  }
  if (!isRecord(value)) return value;
  const next = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, replaceItems(child, id, replacement)])
  );
  return Object.keys(next).some((key) => next[key] !== value[key]) ? next : value;
}

/** Finds the newest full item for mutation revisions; lightweight placement sources are excluded. */
export function highestCachedItem(queryClient: QueryClient, id: string): WebItem | undefined {
  let highest: WebItem | undefined;
  const consider = (item: WebItem) => {
    if (item.id === id && (highest === undefined || item.revision > highest.revision))
      highest = item;
  };
  for (const query of queryClient.getQueryCache().getAll()) {
    if (isWebItemQuery(query.queryKey)) visitItems(query.state.data, consider);
  }
  return highest;
}

/** Updates full items and lightweight placement projections while preserving unrelated references. */
export function replaceCachedItem(value: unknown, id: string, replacement: WebItem): unknown {
  return replaceItems(value, id, replacement);
}
