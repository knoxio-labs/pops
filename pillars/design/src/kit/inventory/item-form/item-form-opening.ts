import { type ItemFormValues, type PendingConnection } from './types';

import type { InventoryFixtureItem } from '@/fixtures/inventory-items';
import type { LocationNode } from '@/fixtures/inventory-locations';
import type { ConnectCandidateItem } from '@/kit/inventory/connections/types';
import type { DocumentItem } from '@/kit/inventory/documents/document-list';
import type { PendingDocumentFile } from '@/kit/inventory/documents/document-upload';
import type { PhotoItem } from '@/kit/inventory/photos/photo-gallery';
import type { UploadedFile } from '@/kit/inventory/photos/photo-upload';

import type { TakenAssetId } from './use-asset-id-validation';

/** How the page was opened: create mode, or edit mode at some point in its own load. */
export interface ItemFormOpening {
  /** Edit mode's item id. Undefined means create mode, matching `!!id` in the source. */
  id?: string;
  /** Edit mode only: still fetching the item. */
  loading?: boolean;
  /** Edit mode only: the fetch came back 404. */
  notFound?: boolean;
  /** The record edit mode loaded, once `loading`/`notFound` are both false. */
  item?: InventoryFixtureItem;
  /** Seeds the draft with values beyond what `item` supplies, e.g. a half-typed create draft. */
  initialValues?: Partial<ItemFormValues>;
  /** Open already validated once, as a rejected submit leaves the form. */
  submitted?: boolean;
  /** A save already in flight. */
  saving?: boolean;
  /** A save that came back rejected. */
  saveError?: string | null;
  locationTree?: LocationNode[];
  takenAssetIds?: readonly TakenAssetId[];
  /** Runs the asset-id uniqueness check once on mount against the initial `assetId`, see `useAssetIdValidation`. */
  assetIdCheckOnMount?: boolean;
  photos?: PhotoItem[];
  uploadFiles?: UploadedFile[];
  documents?: DocumentItem[];
  documentUploadFiles?: PendingDocumentFile[];
  pendingConnections?: PendingConnection[];
  connectionSearch?: string;
  /** The pool `ConnectionsSection`'s inline search answers with once the search is 2+ characters. */
  connectionCandidates?: ConnectCandidateItem[];
  connectionSearchLoading?: boolean;
  notesPreview?: boolean;
  onCancel?: () => void;
}
