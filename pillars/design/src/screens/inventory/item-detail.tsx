import { connectCandidateItemsEmpty } from '@/fixtures/inventory-connections';
import { paperlessSearchError, paperlessSearchResultsEmpty } from '@/fixtures/inventory-documents';
import {
  itemConnectionsEmpty,
  linkedDocumentsEmpty,
  paperlessStatusNotConfigured,
  paperlessStatusUnavailable,
} from '@/fixtures/inventory-item-detail';
import { inventoryItem, inventoryItemMinimal } from '@/fixtures/inventory-items';
import { PHOTOS_BY_ITEM } from '@/fixtures/inventory-photos';
import { ItemDetailPage } from '@/kit/inventory/item-detail/item-detail-page';
import {
  ItemDetailErrorState,
  ItemDetailSkeleton,
} from '@/kit/inventory/item-detail/item-detail-page-states';
import {
  DEFAULT_ITEM_DETAIL_CONNECTIONS,
  DEFAULT_ITEM_DETAIL_DOCUMENTS,
  DEFAULT_ITEM_DETAIL_GRAPH,
  DEFAULT_ITEM_DETAIL_LINK_DIALOG,
  DEFAULT_ITEM_DETAIL_PHOTOS,
} from '@/kit/inventory/item-detail/item-detail-page-types';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ItemDetailPageProps } from '@/kit/inventory/item-detail/item-detail-page';
import type { ComponentType, ReactNode } from 'react';

export const meta: ScreenMeta = { title: 'Item detail', order: 2, frame: 'web' };

function Page({ children }: { children: ReactNode }) {
  return <div className="p-6">{children}</div>;
}

/** One state entry: `ItemDetailPage` under the given prop overrides, in the page's own padded wrapper. */
function detailState(overrides: ItemDetailPageProps = {}): ComponentType {
  return () => (
    <Page>
      <ItemDetailPage {...overrides} />
    </Page>
  );
}

export const states: ScreenStates = {
  loading: () => (
    <Page>
      <ItemDetailSkeleton />
    </Page>
  ),
  'not-found': () => (
    <Page>
      <ItemDetailErrorState variant="not-found" />
    </Page>
  ),
  error: () => (
    <Page>
      <ItemDetailErrorState variant="error" />
    </Page>
  ),
  minimal: detailState({
    item: inventoryItemMinimal,
    locationPath: null,
    photos: { ...DEFAULT_ITEM_DETAIL_PHOTOS, items: [] },
    connections: { ...DEFAULT_ITEM_DETAIL_CONNECTIONS, items: itemConnectionsEmpty },
    documents: { ...DEFAULT_ITEM_DETAIL_DOCUMENTS, configured: false, items: linkedDocumentsEmpty },
  }),
  'location-loading': detailState({ locationPath: null }),
  'location-none': detailState({
    item: { ...inventoryItem, locationId: null },
    locationPath: null,
  }),
  'purchase-link-hidden': detailState({
    item: {
      ...inventoryItem,
      purchaseTransactionId: null,
      purchasedFromId: null,
      purchasedFromName: null,
    },
  }),
  'no-photos': detailState({ photos: { ...DEFAULT_ITEM_DETAIL_PHOTOS, items: [] } }),
  'photos-loading': detailState({ photos: { ...DEFAULT_ITEM_DETAIL_PHOTOS, loading: true } }),
  'single-photo': detailState({
    photos: { ...DEFAULT_ITEM_DETAIL_PHOTOS, items: PHOTOS_BY_ITEM['itm-laptop'] ?? [] },
  }),
  'reordering-photos': detailState({
    photos: { ...DEFAULT_ITEM_DETAIL_PHOTOS, isReordering: true },
  }),
  'no-connections': detailState({
    connections: { ...DEFAULT_ITEM_DETAIL_CONNECTIONS, items: itemConnectionsEmpty },
  }),
  'connections-loading': detailState({
    connections: { ...DEFAULT_ITEM_DETAIL_CONNECTIONS, loading: true },
  }),
  'connect-dialog-open': detailState({
    connections: { ...DEFAULT_ITEM_DETAIL_CONNECTIONS, dialogOpen: true, dialogSearch: 'dyson' },
  }),
  'connect-dialog-no-results': detailState({
    connections: {
      ...DEFAULT_ITEM_DETAIL_CONNECTIONS,
      dialogOpen: true,
      dialogSearch: 'zzz',
      candidates: connectCandidateItemsEmpty,
    },
  }),
  'connection-graph-loading': detailState({
    graph: { ...DEFAULT_ITEM_DETAIL_GRAPH, initialShowGraph: true, status: 'loading' },
  }),
  'connection-graph-unavailable': detailState({
    graph: {
      ...DEFAULT_ITEM_DETAIL_GRAPH,
      initialShowGraph: true,
      status: 'unavailable',
      data: null,
    },
  }),
  'connection-graph-error': detailState({
    graph: { ...DEFAULT_ITEM_DETAIL_GRAPH, initialShowGraph: true, status: 'error', data: null },
  }),
  'connection-graph-ready': detailState({
    graph: { ...DEFAULT_ITEM_DETAIL_GRAPH, initialShowGraph: true, status: 'ready' },
  }),
  'connection-trace-loading': detailState({
    graph: { ...DEFAULT_ITEM_DETAIL_GRAPH, traceStatus: 'loading', traceTree: null },
  }),
  'connection-trace-unavailable': detailState({
    graph: { ...DEFAULT_ITEM_DETAIL_GRAPH, traceStatus: 'unavailable', traceTree: null },
  }),
  'connection-trace-error': detailState({
    graph: { ...DEFAULT_ITEM_DETAIL_GRAPH, traceStatus: 'error', traceTree: null },
  }),
  'no-documents': detailState({
    documents: { ...DEFAULT_ITEM_DETAIL_DOCUMENTS, items: linkedDocumentsEmpty },
  }),
  'documents-not-configured': detailState({
    documents: {
      ...DEFAULT_ITEM_DETAIL_DOCUMENTS,
      configured: paperlessStatusNotConfigured.configured,
      available: paperlessStatusNotConfigured.available,
      baseUrl: paperlessStatusNotConfigured.baseUrl,
    },
  }),
  'documents-unavailable': detailState({
    documents: {
      ...DEFAULT_ITEM_DETAIL_DOCUMENTS,
      configured: paperlessStatusUnavailable.configured,
      available: paperlessStatusUnavailable.available,
      baseUrl: paperlessStatusUnavailable.baseUrl,
    },
  }),
  'documents-loading': detailState({
    documents: { ...DEFAULT_ITEM_DETAIL_DOCUMENTS, loading: true },
  }),
  'link-document-dialog-open': detailState({
    linkDialog: {
      ...DEFAULT_ITEM_DETAIL_LINK_DIALOG,
      initialOpen: true,
      initialSearch: 'espresso',
    },
  }),
  'link-document-dialog-no-results': detailState({
    linkDialog: {
      ...DEFAULT_ITEM_DETAIL_LINK_DIALOG,
      initialOpen: true,
      initialSearch: 'zzz',
      results: paperlessSearchResultsEmpty,
    },
  }),
  'link-document-dialog-error': detailState({
    linkDialog: {
      ...DEFAULT_ITEM_DETAIL_LINK_DIALOG,
      initialOpen: true,
      initialSearch: 'espresso',
      results: paperlessSearchResultsEmpty,
      error: paperlessSearchError,
    },
  }),
  'delete-confirmation-open': detailState({ initialDeleteConfirmOpen: true }),
};

export default function ItemDetailScreen() {
  return (
    <Page>
      <ItemDetailPage />
    </Page>
  );
}
