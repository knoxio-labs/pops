import { useCallback } from 'react';

import { isNotFoundError, isUnavailableError } from '../../inventory-api-helpers.js';
import { toEventModel } from '../../inventory-web/event-model.js';
import { usePendingItemIds } from '../../inventory-web/item-verbs.js';
import { useCatalogueLookups } from '../../inventory-web/useCatalogueLookups.js';
import { useWebEvents } from '../../inventory-web/useWebEvents.js';
import { useWebItemDetail } from '../../inventory-web/useWebItemDetail.js';
import { effectiveFields, typePath } from '../../lib/type-tree.js';
import { useAuxiliaryQueries, useConnectionSources } from './detail-read-queries';
import {
  aggregateFor,
  buildModel,
  connectionsFor,
  displayItem,
  documentsFor,
  itemDetailBannerState,
  paperlessFor,
  retryReads,
  statusFor,
} from './use-item-detail-state';

import type { ItemRowModel } from '../../foundation/model/model';
import type { WebGetResponse } from '../../inventory-api/types.gen.js';
import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';
import type { ItemDetailModel } from './detail-model';
import type { ItemDetailBannerState } from './use-item-detail-state';

function resolvedTypeAndItem(
  types: readonly CatalogueType[],
  typeForId: (id: string | null | undefined) => CatalogueType | null,
  webItem: WebGetResponse['item'] | null,
  displayedItem: ItemRowModel | null
): { type: CatalogueType | null; item: ItemRowModel | null } {
  const rawType = typeForId(webItem?.typeId ?? displayedItem?.typeId);
  const type = rawType === null ? null : { ...rawType, fields: effectiveFields(types, rawType.id) };
  if (displayedItem === null || rawType === null) return { type, item: displayedItem };
  return {
    type,
    item: { ...displayedItem, typeName: typePath(types, rawType.id).join(' › ') },
  };
}

function itemDetailReadSignals(
  detailQuery: ReturnType<typeof useWebItemDetail>,
  events: ReturnType<typeof useWebEvents>,
  sources: ReturnType<typeof useConnectionSources>,
  auxiliary: ReturnType<typeof useAuxiliaryQueries>
) {
  const hasPending = [
    detailQuery.isPending,
    events.status === 'pending',
    sources.graphQuery.isPending,
    sources.related.isLoading,
    auxiliary.documentsQuery.isPending,
    auxiliary.paperlessQuery.isPending,
    auxiliary.fixtureLinksQuery.isPending,
    auxiliary.fixturesQuery.isPending,
  ].some(Boolean);
  const failures = [
    { failed: events.status === 'error', error: events.error },
    { failed: sources.graphQuery.isError, error: sources.graphQuery.error },
    { failed: sources.related.isError, error: sources.related.error },
    { failed: auxiliary.documentsQuery.isError, error: auxiliary.documentsQuery.error },
    { failed: auxiliary.paperlessQuery.isError, error: auxiliary.paperlessQuery.error },
    { failed: auxiliary.fixtureLinksQuery.isError, error: auxiliary.fixtureLinksQuery.error },
    { failed: auxiliary.fixturesQuery.isError, error: auxiliary.fixturesQuery.error },
  ].filter((failure) => failure.failed);
  return {
    hasPending,
    hasUnavailable:
      failures.length > 0 && failures.every((failure) => isUnavailableError(failure.error)),
    hasError: failures.some((failure) => !isUnavailableError(failure.error)),
  };
}

/** The stable read states exposed by the item-detail data hook. */
export type ItemDetailStatus = 'loading' | 'error' | 'not-found' | 'ready';

/** Data and retry state for the split item-detail page. */
export interface ItemDetailModelState {
  status: ItemDetailStatus;
  error: unknown | null;
  model: ItemDetailModel | null;
  banner: ItemDetailBannerState | null;
  retry: () => void;
}

/** Reads the primary placement, web aggregate, and independent detail sections. */
export function useItemDetailModel(id: string): ItemDetailModelState {
  const catalogue = useCatalogueLookups();
  const pendingIds = usePendingItemIds();
  const detailQuery = useWebItemDetail(id, 50);
  const events = useWebEvents({ entityId: id, limit: 8 });
  const webItem = detailQuery.data?.item ?? null;
  const sources = useConnectionSources(id, webItem);
  const auxiliary = useAuxiliaryQueries(id);
  const displayedItem = displayItem(sources.primary.world.items.get(id), pendingIds);
  const resolved = resolvedTypeAndItem(
    catalogue.types,
    catalogue.typeForId,
    webItem,
    displayedItem
  );
  const { type, item: baseItem } = resolved;
  const typeNames = catalogue.typeNameById;
  const aggregate = aggregateFor(webItem, type, sources.relatedWorld, catalogue.types);
  const documents = documentsFor(auxiliary.documentsQuery);
  const paperless = paperlessFor(auxiliary.paperlessQuery);
  const connections = connectionsFor(id, sources, auxiliary);
  const eventModels = events.events.map((event) =>
    toEventModel(event, sources.primary.world, typeNames)
  );
  const model = buildModel({
    baseItem,
    primaryWorld: sources.primary.world,
    relatedWorld: sources.relatedWorld,
    aggregate,
    documents,
    paperless,
    paperlessBaseUrl: auxiliary.paperlessQuery.data?.data.baseUrl ?? null,
    connections,
    events: eventModels,
    eventCount: events.total,
  });
  const notFound = isNotFoundError(detailQuery.error);
  const primaryError = sources.primary.isError ? sources.primary.error : null;
  const error = detailQuery.error ?? primaryError ?? null;
  const status: ItemDetailStatus = statusFor(id, notFound, error, model);
  const banner = itemDetailBannerState(
    model,
    itemDetailReadSignals(detailQuery, events, sources, auxiliary)
  );
  const retry = useCallback(
    () => retryReads({ id, detailQuery, sources, auxiliary, events }),
    [auxiliary, detailQuery, events, id, sources]
  );
  return { status, error, model, banner, retry };
}
