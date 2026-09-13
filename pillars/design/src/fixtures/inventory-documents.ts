/**
 * The documents (and document-adjacent search/upload states) the inventory
 * document controls render: `DocumentUpload`, `PendingDocumentRow`,
 * `DocumentList` and `LinkDocumentDialog`.
 *
 * `InventoryFixtureDocument` mirrors `DocumentItem` from `DocumentList.tsx`
 * (what `GET /items/{id}/documents` serves for a row); `PaperlessFixtureResult`
 * mirrors the `PaperlessDocResult` shape `LinkDocumentDialog` searches through.
 * Both are copied here rather than imported, since the kit may not depend on
 * `@pops/inventory` or its generated client.
 *
 * The set is chosen so a screen composing these controls hits every visual
 * state the source distinguishes: several documents of different kinds on
 * one item, a single document, none at all, a document missing its title or
 * its date, a Paperless search with results and one with none, and pending/
 * uploading/done/error rows for the upload queue.
 */

export interface InventoryFixtureDocument {
  id: number;
  itemId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
}

/** Mirrors `PaperlessDocResult` from `LinkDocumentDialog.tsx`. */
export interface PaperlessFixtureResult {
  id: number;
  title: string;
  created: string;
  originalFileName: string;
  thumbnailUrl: string;
}

/**
 * A pending upload queue entry, shaped like `PendingDocumentFile` from
 * `DocumentUpload.tsx` minus the real `File` object, which a fixture cannot
 * construct without a browser file picker. `document-upload.tsx` builds a
 * `File` from `fileName`/`fileSize` at render time.
 */
export interface PendingDocumentFixture {
  localId: string;
  fileName: string;
  fileSize: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress?: number;
  error?: string;
}

/** `itm-tv`'s documents: one of every kind `DOCUMENT_TYPES` names. */
export const inventoryDocumentsForTv: InventoryFixtureDocument[] = [
  {
    id: 1,
    itemId: 'itm-tv',
    fileName: 'jb-hifi-receipt.pdf',
    filePath: 'items/itm-tv/jb-hifi-receipt.pdf',
    mimeType: 'application/pdf',
    fileSize: 184_320,
    uploadedAt: '2026-02-14T08:30:00.000Z',
  },
  {
    id: 2,
    itemId: 'itm-tv',
    fileName: 'lg-c4-user-manual.pdf',
    filePath: 'items/itm-tv/lg-c4-user-manual.pdf',
    mimeType: 'application/pdf',
    fileSize: 4_821_760,
    uploadedAt: '2026-02-15T11:05:00.000Z',
  },
  {
    id: 3,
    itemId: 'itm-tv',
    fileName: 'warranty-certificate.pdf',
    filePath: 'items/itm-tv/warranty-certificate.pdf',
    mimeType: 'application/pdf',
    fileSize: 92_160,
    uploadedAt: '2026-02-16T02:12:00.000Z',
  },
  {
    id: 4,
    itemId: 'itm-tv',
    fileName: 'home-insurance-schedule.pdf',
    filePath: 'items/itm-tv/home-insurance-schedule.pdf',
    mimeType: 'application/pdf',
    fileSize: 331_776,
    uploadedAt: '2026-03-01T22:40:00.000Z',
  },
];

/** `itm-drill`'s single document: the list's "one row" branch. */
export const inventoryDocumentsForDrill: InventoryFixtureDocument[] = [
  {
    id: 5,
    itemId: 'itm-drill',
    fileName: 'makita-receipt.jpg',
    filePath: 'items/itm-drill/makita-receipt.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1_048_576,
    uploadedAt: '2024-06-08T05:15:00.000Z',
  },
];

/** No documents at all: `DocumentList`'s empty state. */
export const inventoryDocumentsEmpty: InventoryFixtureDocument[] = [];

export const inventoryDocumentsBaseUrl = '/api/inventory/documents';

/**
 * Paperless search results for "espresso": a thumbnail-bearing hit, one with
 * no thumbnail (falls back to the `FileText` placeholder), and one missing
 * both `created` and `originalFileName`: the row's "No date" branch with no
 * trailing filename.
 */
export const paperlessSearchResults: PaperlessFixtureResult[] = [
  {
    id: 101,
    title: 'Breville espresso machine invoice',
    created: '2023-11-20T00:00:00.000Z',
    originalFileName: 'breville-invoice-2023.pdf',
    thumbnailUrl: 'https://placehold.co/80x80?text=PDF',
  },
  {
    id: 102,
    title: 'Espresso machine warranty card',
    created: '2023-11-22T00:00:00.000Z',
    originalFileName: 'warranty-card-scan.jpg',
    thumbnailUrl: '',
  },
  {
    id: 103,
    title: '',
    created: '',
    originalFileName: '',
    thumbnailUrl: '',
  },
];

/** A Paperless search that matched nothing: the dialog's empty-results branch. */
export const paperlessSearchResultsEmpty: PaperlessFixtureResult[] = [];

/** A Paperless search that failed outright: shown in the results slot instead of a match count. */
export const paperlessSearchError =
  'Could not reach Paperless-ngx. Check the connection and retry.';

/**
 * One entry per `PendingDocumentFile.status`, so `DocumentUpload` and
 * `PendingDocumentRow` render every branch of `FileStatus` at once: ready to
 * upload, mid-upload with a progress value, uploaded, and failed with a
 * message.
 */
export const pendingDocumentQueue: PendingDocumentFixture[] = [
  {
    localId: 'pending-1',
    fileName: 'ikea-invoice.pdf',
    fileSize: 245_760,
    status: 'pending',
  },
  {
    localId: 'pending-2',
    fileName: 'extended-warranty-scan.png',
    fileSize: 2_097_152,
    status: 'uploading',
    progress: 62,
  },
  {
    localId: 'pending-3',
    fileName: 'delivery-note.pdf',
    fileSize: 71_680,
    status: 'done',
  },
  {
    localId: 'pending-4',
    fileName: 'blurry-photo-of-receipt.heic',
    fileSize: 8_912_896,
    status: 'error',
    error: 'Upload failed: file too large',
  },
];

function mustFirst<T>(items: readonly T[], description: string): T {
  const [first] = items;
  if (!first) throw new Error(`Fixture data missing expected entry: ${description}`);
  return first;
}

/** A single pending file, for a screen showing the queue mid-selection. */
export const pendingDocumentSingle: PendingDocumentFixture[] = [
  mustFirst(pendingDocumentQueue, 'pendingDocumentQueue[0]'),
];
