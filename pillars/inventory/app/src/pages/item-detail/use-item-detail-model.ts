import { useCallback } from 'react';

import { isNotFoundError } from '../../inventory-api-helpers.js';
import { usePendingItemIds } from '../../inventory-web/item-verbs.js';
import { useCatalogueLookups } from '../../inventory-web/useCatalogueLookups.js';
import { useWebEvents } from '../../inventory-web/useWebEvents.js';
import { useWebItemDetail } from '../../inventory-web/useWebItemDetail.js';
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

import type { ItemDetailModel } from './detail-model';
import type { ItemDetailBannerState } from './use-item-detail-state';

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
  const hasError = [
    events.status === 'error',
    sources.graphQuery.isError,
    sources.related.isError,
    auxiliary.documentsQuery.isError,
    auxiliary.paperlessQuery.isError,
    auxiliary.fixtureLinksQuery.isError,
    auxiliary.fixturesQuery.isError,
  ].some(Boolean);
  return { hasPending, hasError };
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
  const baseItem = displayItem(sources.primary.world.items.get(id), pendingIds);
  const type = catalogue.typeForId(webItem?.typeId ?? baseItem?.typeId);
  const aggregate = aggregateFor(webItem, type, sources.relatedWorld);
  const documents = documentsFor(auxiliary.documentsQuery);
  const paperless = paperlessFor(auxiliary.paperlessQuery);
  const connections = connectionsFor(id, sources, auxiliary);
  const model = buildModel({
    baseItem,
    primaryWorld: sources.primary.world,
    relatedWorld: sources.relatedWorld,
    aggregate,
    documents,
    paperless,
    paperlessBaseUrl: auxiliary.paperlessQuery.data?.data.baseUrl ?? null,
    connections,
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
