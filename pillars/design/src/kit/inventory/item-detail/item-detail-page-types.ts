import {
  connectCandidateItems,
  graphBranchAndLeaf,
  traceDeep,
} from '@/fixtures/inventory-connections';
import { paperlessSearchResults } from '@/fixtures/inventory-documents';
import {
  inventoryItemSummaryById,
  itemConnectionsForTv,
  linkedDocumentsForTv,
  paperlessStatusReady,
} from '@/fixtures/inventory-item-detail';
import { PHOTOS_BY_ITEM } from '@/fixtures/inventory-photos';

import type { ConnectionGraphStatus } from '@/kit/inventory/connections/connection-graph';
import type { ConnectionTracePanelStatus } from '@/kit/inventory/connections/connection-trace-panel';
import type { ConnectCandidateItem, GraphData, TraceNode } from '@/kit/inventory/connections/types';
import type { PaperlessDocResult } from '@/kit/inventory/documents/link-document-dialog';
import type { PhotoItem } from '@/kit/inventory/photos/photo-gallery';

import type { ConnectedItemSummary, ItemConnection } from './connections-section';
import type { LinkedDoc } from './documents-section-parts';

export interface ItemDetailPhotosState {
  items: PhotoItem[];
  loading: boolean;
  isReordering: boolean;
}

export interface ItemDetailConnectionsState {
  items: ItemConnection[];
  loading: boolean;
  summaries: Record<string, ConnectedItemSummary>;
  isDisconnecting: boolean;
  candidates: ConnectCandidateItem[];
  candidatesLoading: boolean;
  candidatesError: string | null;
  dialogOpen: boolean;
  dialogSearch: string;
}

export interface ItemDetailGraphState {
  status: ConnectionGraphStatus;
  data: GraphData | null;
  traceStatus: ConnectionTracePanelStatus;
  traceTree: TraceNode | null;
  initialShowGraph: boolean;
}

export interface ItemDetailDocumentsState {
  statusLoading: boolean;
  configured: boolean;
  available: boolean;
  baseUrl: string | null;
  items: LinkedDoc[];
  loading: boolean;
  isUnlinking: boolean;
}

export interface ItemDetailLinkDialogState {
  results: PaperlessDocResult[];
  loading: boolean;
  error: string | null;
  initialOpen: boolean;
  initialSearch: string;
}

export const DEFAULT_ITEM_DETAIL_PHOTOS: ItemDetailPhotosState = {
  items: PHOTOS_BY_ITEM['itm-tv'] ?? [],
  loading: false,
  isReordering: false,
};

export const DEFAULT_ITEM_DETAIL_CONNECTIONS: ItemDetailConnectionsState = {
  items: itemConnectionsForTv,
  loading: false,
  summaries: inventoryItemSummaryById,
  isDisconnecting: false,
  candidates: connectCandidateItems,
  candidatesLoading: false,
  candidatesError: null,
  dialogOpen: false,
  dialogSearch: '',
};

export const DEFAULT_ITEM_DETAIL_GRAPH: ItemDetailGraphState = {
  status: 'ready',
  data: graphBranchAndLeaf,
  traceStatus: 'ready',
  traceTree: traceDeep,
  initialShowGraph: false,
};

export const DEFAULT_ITEM_DETAIL_DOCUMENTS: ItemDetailDocumentsState = {
  statusLoading: false,
  configured: true,
  available: true,
  baseUrl: paperlessStatusReady.baseUrl,
  items: linkedDocumentsForTv,
  loading: false,
  isUnlinking: false,
};

export const DEFAULT_ITEM_DETAIL_LINK_DIALOG: ItemDetailLinkDialogState = {
  results: paperlessSearchResults,
  loading: false,
  error: null,
  initialOpen: false,
  initialSearch: '',
};
