import { itemDetailLocationPath } from '@/fixtures/inventory-item-detail';
import { inventoryItem } from '@/fixtures/inventory-items';
import { useState } from 'react';

import { ItemDetailHeader, ItemDetailSections } from './item-detail-page-sections';
import {
  DEFAULT_ITEM_DETAIL_CONNECTIONS,
  DEFAULT_ITEM_DETAIL_DOCUMENTS,
  DEFAULT_ITEM_DETAIL_GRAPH,
  DEFAULT_ITEM_DETAIL_LINK_DIALOG,
  DEFAULT_ITEM_DETAIL_PHOTOS,
} from './item-detail-page-types';

import type { InventoryFixtureItem } from '@/fixtures/inventory-items';

import type {
  ItemDetailConnectionsState,
  ItemDetailDocumentsState,
  ItemDetailGraphState,
  ItemDetailLinkDialogState,
  ItemDetailPhotosState,
} from './item-detail-page-types';

export interface ItemDetailPageProps {
  item?: InventoryFixtureItem;
  locationPath?: { id: string; name: string }[] | null;
  photos?: ItemDetailPhotosState;
  connections?: ItemDetailConnectionsState;
  graph?: ItemDetailGraphState;
  documents?: ItemDetailDocumentsState;
  linkDialog?: ItemDetailLinkDialogState;
  initialDeleteConfirmOpen?: boolean;
  onNavigate?: (path: string) => void;
}

/**
 * `/inventory/items/:id`: an item's full record, its photos, its linked
 * documents and its connections to other items. `useItemDetailPageModel`'s
 * four queries and three mutations become the grouped props above; every
 * Link becomes a plain anchor whose click reports to `onNavigate` instead of
 * routing, since the canvas renders inside an iframe and a real navigation
 * would leave it.
 */
export function ItemDetailPage({
  item = inventoryItem,
  locationPath = itemDetailLocationPath,
  photos = DEFAULT_ITEM_DETAIL_PHOTOS,
  connections = DEFAULT_ITEM_DETAIL_CONNECTIONS,
  graph = DEFAULT_ITEM_DETAIL_GRAPH,
  documents = DEFAULT_ITEM_DETAIL_DOCUMENTS,
  linkDialog = DEFAULT_ITEM_DETAIL_LINK_DIALOG,
  initialDeleteConfirmOpen = false,
  onNavigate = () => {},
}: ItemDetailPageProps) {
  const [linkSearch, setLinkSearch] = useState(linkDialog.initialSearch);

  return (
    <div className="max-w-3xl">
      <ItemDetailHeader
        item={item}
        connectionsCount={connections.items.length}
        photosCount={photos.items.length}
        locationPath={locationPath}
        onNavigate={onNavigate}
        initialDeleteConfirmOpen={initialDeleteConfirmOpen}
      />
      <ItemDetailSections
        item={item}
        photos={photos}
        connections={connections}
        graph={graph}
        documents={documents}
        linkDialog={linkDialog}
        linkSearch={linkSearch}
        setLinkSearch={setLinkSearch}
        onNavigate={onNavigate}
      />
    </div>
  );
}
