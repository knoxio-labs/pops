/**
 * Fixtures specific to the item detail screen (`/inventory/items/:id`):
 * the location path, the raw item-to-item connections, a per-item summary
 * lookup standing in for each connection row's own item fetch, and the
 * linked-document set the Documents section groups by type.
 *
 * Everything else the screen composes (photos, the connection graph/trace,
 * the connect dialog's candidates, Paperless search results) already has a
 * fixture under this directory; this file only adds what item-detail needs
 * and nothing else has.
 */
import { inventoryItem, inventoryItemMinimal, inventoryItems } from './inventory-items';
import { locationPathMap, type LocationSegmentFixture } from './inventory-locations';

/** Root-first breadcrumb segments for {@link inventoryItem}'s location. */
export const itemDetailLocationPath: LocationSegmentFixture[] =
  locationPathMap().get(inventoryItem.locationId ?? '') ?? [];

/** A summary of one item, as each connection row's own item fetch resolves it. */
export interface InventoryItemSummary {
  itemName: string;
  brand: string | null;
  assetId: string | null;
  type: string | null;
}

/**
 * Every fixture item's summary, keyed by id: stands in for `ConnectionRow`'s
 * own `itemsGet` query in the source, which resolves each connected id
 * independently of the connections list itself.
 */
export const inventoryItemSummaryById: Record<string, InventoryItemSummary> = Object.fromEntries(
  [...inventoryItems, inventoryItemMinimal].map((item) => [
    item.id,
    { itemName: item.itemName, brand: item.brand, assetId: item.assetId, type: item.type },
  ])
);

/** As `GET /items/{id}/connections` serves a row: a plain, undirected pairing. */
export interface InventoryFixtureConnection {
  id: number;
  itemAId: string;
  itemBId: string;
  createdAt: string;
}

/**
 * {@link inventoryItem} (the TV)'s raw connections: one with the TV as
 * `itemAId`, one as `itemBId` (exercising both sides of `ConnectionRow`'s
 * `itemAId === itemId ? itemBId : itemAId` branch), and the second pointing
 * at an id with no summary fixture, standing in for a connection whose own
 * item fetch is still loading or 404s.
 */
export const itemConnectionsForTv: InventoryFixtureConnection[] = [
  { id: 1, itemAId: 'itm-tv', itemBId: 'itm-laptop', createdAt: '2026-03-01T00:00:00.000Z' },
  { id: 2, itemAId: 'itm-unresolved', itemBId: 'itm-tv', createdAt: '2026-03-04T00:00:00.000Z' },
];

/** No connections at all: hides the Connection Chain section entirely. */
export const itemConnectionsEmpty: InventoryFixtureConnection[] = [];

/** Mirrors `LinkedDoc` from `DocumentsSection.parts.tsx`. */
export interface InventoryLinkedDocument {
  id: number;
  documentType: string;
  paperlessDocumentId: number;
  title: string | null;
  createdAt: string;
}

/**
 * {@link inventoryItem}'s linked documents: one of every type
 * `DOCUMENT_TYPE_LABELS` names, a document with no title (the
 * `Document #{id}` fallback), and one whose `documentType` isn't in that
 * map at all (the raw-type-string fallback `DOCUMENT_TYPE_LABELS[type] ?? type`
 * falls through to).
 */
export const linkedDocumentsForTv: InventoryLinkedDocument[] = [
  {
    id: 1,
    documentType: 'receipt',
    paperlessDocumentId: 501,
    title: 'JB Hi-Fi receipt',
    createdAt: '2026-02-14T08:30:00.000Z',
  },
  {
    id: 2,
    documentType: 'warranty',
    paperlessDocumentId: 502,
    title: 'Warranty certificate',
    createdAt: '2026-02-16T02:12:00.000Z',
  },
  {
    id: 3,
    documentType: 'manual',
    paperlessDocumentId: 503,
    title: 'LG C4 user manual',
    createdAt: '2026-02-15T11:05:00.000Z',
  },
  {
    id: 4,
    documentType: 'invoice',
    paperlessDocumentId: 504,
    title: null,
    createdAt: '2026-03-01T22:40:00.000Z',
  },
  {
    id: 5,
    documentType: 'insurance',
    paperlessDocumentId: 505,
    title: 'Home insurance schedule',
    createdAt: '2026-03-02T00:10:00.000Z',
  },
];

/** No documents linked yet: `DocumentsBody`'s empty state. */
export const linkedDocumentsEmpty: InventoryLinkedDocument[] = [];

/** Mirrors the `paperlessStatus` payload shape `DocumentsSection` branches on. */
export interface PaperlessStatusFixture {
  configured: boolean;
  available: boolean;
  baseUrl: string | null;
}

export const paperlessStatusNotConfigured: PaperlessStatusFixture = {
  configured: false,
  available: false,
  baseUrl: null,
};

export const paperlessStatusUnavailable: PaperlessStatusFixture = {
  configured: true,
  available: false,
  baseUrl: null,
};

export const paperlessStatusReady: PaperlessStatusFixture = {
  configured: true,
  available: true,
  baseUrl: 'https://paperless.example.com',
};
