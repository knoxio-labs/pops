import {
  connectCandidateItems,
  connectCandidateItemsEmpty,
} from '@/fixtures/inventory-connections';
import { inventoryDocumentsForTv, pendingDocumentQueue } from '@/fixtures/inventory-documents';
import {
  draftInProgress,
  freeAssetId,
  takenAssetIdSample,
  takenAssetIds,
} from '@/fixtures/inventory-item-form';
/**
 * Port of `pillars/inventory/app/src/pages/ItemFormPage.tsx`, the one
 * component behind both `/inventory/items/new` and
 * `/inventory/items/:id/edit`. Shows the create-mode form, the edit-mode
 * form pre-filled from a fixture item, the loading skeleton and error views
 * edit mode can land on while it fetches, and every validation, upload and
 * connections state the sections below can be in. The page itself, its
 * skeleton/not-found views and its form body live in
 * `@/kit/inventory/item-form/item-form-page`.
 */
import { inventoryItem, inventoryItemMinimal } from '@/fixtures/inventory-items';
import { locationTree, locationTreeEmpty } from '@/fixtures/inventory-locations';
import { PHOTOS_BY_ITEM, UPLOAD_QUEUE_FIXTURES } from '@/fixtures/inventory-photos';
import { ItemFormPage } from '@/kit/inventory/item-form/item-form-page';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ItemFormOpening } from '@/kit/inventory/item-form/use-item-form-state';

export const meta: ScreenMeta = { title: 'Item form', order: 3, frame: 'web' };

const connectionsSearchingOpening: ItemFormOpening = {
  connectionSearch: 'mac',
  connectionSearchLoading: true,
  connectionCandidates: connectCandidateItems,
};

export const states: ScreenStates = {
  edit: () => (
    <ItemFormPage
      opening={{
        id: inventoryItem.id,
        item: inventoryItem,
        photos: PHOTOS_BY_ITEM['itm-tv'],
        documents: inventoryDocumentsForTv,
        locationTree,
      }}
    />
  ),
  'edit-loading': () => <ItemFormPage opening={{ id: inventoryItem.id, loading: true }} />,
  'edit-not-found': () => <ItemFormPage opening={{ id: 'itm-missing', notFound: true }} />,
  'edit-minimal': () => (
    <ItemFormPage
      opening={{
        id: inventoryItemMinimal.id,
        item: inventoryItemMinimal,
        locationTree: locationTreeEmpty,
      }}
    />
  ),
  dirty: () => <ItemFormPage opening={{ initialValues: draftInProgress, locationTree }} />,
  'validation-errors': () => <ItemFormPage opening={{ submitted: true, locationTree }} />,
  'asset-id-checking': () => (
    <ItemFormPage
      opening={{
        initialValues: { type: 'Electronics', assetId: takenAssetIdSample.assetId },
        takenAssetIds,
        assetIdCheckOnMount: true,
      }}
    />
  ),
  'asset-id-taken': () => (
    <ItemFormPage
      opening={{
        initialValues: { type: 'Electronics', assetId: takenAssetIdSample.assetId },
        takenAssetIds,
        assetIdCheckOnMount: true,
      }}
    />
  ),
  'asset-id-free': () => (
    <ItemFormPage
      opening={{
        initialValues: { type: 'Electronics', assetId: freeAssetId },
        takenAssetIds,
        assetIdCheckOnMount: true,
      }}
    />
  ),
  saving: () => (
    <ItemFormPage opening={{ initialValues: draftInProgress, saving: true, locationTree }} />
  ),
  'save-failed': () => (
    <ItemFormPage
      opening={{
        initialValues: draftInProgress,
        saveError: 'Failed to create: inventory API request failed',
        locationTree,
      }}
    />
  ),
  'photos-empty': () => (
    <ItemFormPage opening={{ id: inventoryItem.id, item: inventoryItem, photos: [] }} />
  ),
  'photos-populated': () => (
    <ItemFormPage
      opening={{ id: inventoryItem.id, item: inventoryItem, photos: PHOTOS_BY_ITEM['itm-tv'] }}
    />
  ),
  'photos-uploading': () => (
    <ItemFormPage
      opening={{
        id: inventoryItem.id,
        item: inventoryItem,
        photos: [],
        uploadFiles: UPLOAD_QUEUE_FIXTURES,
      }}
    />
  ),
  'photos-upload-failed': () => (
    <ItemFormPage
      opening={{
        id: inventoryItem.id,
        item: inventoryItem,
        photos: [],
        uploadFiles: UPLOAD_QUEUE_FIXTURES.filter((f) => f.status === 'error'),
      }}
    />
  ),
  'documents-create-mode': () => <ItemFormPage opening={{}} />,
  'documents-empty': () => (
    <ItemFormPage opening={{ id: inventoryItem.id, item: inventoryItem, documents: [] }} />
  ),
  'documents-populated': () => (
    <ItemFormPage
      opening={{ id: inventoryItem.id, item: inventoryItem, documents: inventoryDocumentsForTv }}
    />
  ),
  'documents-uploading': () => (
    <ItemFormPage
      opening={{
        id: inventoryItem.id,
        item: inventoryItem,
        documents: inventoryDocumentsForTv,
        documentUploadFiles: pendingDocumentQueue.map((f) => ({
          localId: f.localId,
          file: new File([''], f.fileName),
          status: f.status,
          progress: f.progress,
          error: f.error,
        })),
      }}
    />
  ),
  'connections-empty': () => (
    <ItemFormPage opening={{ connectionCandidates: connectCandidateItemsEmpty }} />
  ),
  'connections-populated': () => (
    <ItemFormPage
      opening={{
        pendingConnections: [
          { id: 'itm-laptop', itemName: 'MacBook Pro 16" M4 Max' },
          { id: 'itm-camera', itemName: 'Fujifilm X-T5 body' },
        ],
        connectionCandidates: connectCandidateItems,
      }}
    />
  ),
  'connections-searching': () => <ItemFormPage opening={connectionsSearchingOpening} />,
  'connections-search-results': () => (
    <ItemFormPage
      opening={{ connectionSearch: 'mac', connectionCandidates: connectCandidateItems }}
    />
  ),
};

export default function ItemFormScreen() {
  return <ItemFormPage />;
}
