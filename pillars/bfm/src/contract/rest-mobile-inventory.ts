/**
 * `/mobile/inventory/*` — bfm's relay of the inventory pillar's sync protocol
 * (Inventory ADR-002 D9/D10, `pillars/inventory/src/contract/rest-sync.ts`).
 *
 * The type catalogue, the paged snapshot, the change feed and one item's
 * history (slice A9) are read routes; `mutations` and `suggestCodes` (A12)
 * are the write ones, gated by their own capability (`inventory.write`) on
 * the same reasoning `purchases.write` is declared apart from
 * `purchases.read` — writing is its own authority.
 *
 * `putMedia`/`getMedia` (A13, ADR-002 D9) relay inventory's content-addressed
 * media store — a photo's bytes ahead of the `item.attachPhoto` mutation that
 * references them. Unlike every other route here, the leg behind bfm is not
 * inventory's sync protocol: see `api/inventory/media-client.ts` for why it
 * cannot be.
 *
 * `409` and `426` are declared on every READ route, because the producer can
 * answer either on any of them:
 *
 * - `409` (`resync_required`) — the producer's epoch or high-water mark moved
 *   out from under this replica; the app's recovery is to discard its local
 *   replica and re-snapshot.
 * - `426` (`client_too_old`) — never actually reaches a handler's typed
 *   return; see `api/rest/inventory-protocol-error.ts` for why.
 *
 * `mutations` declares no `409`: a conflict there is not a fact about the
 * replica being stale, it is one mutation's own outcome
 * (`MobileMutationOutcomeSchema`'s `conflict` member) inside an otherwise
 * successful `200`, exactly as inventory's own `POST /sync/mutations`
 * answers it. It declares `413` instead — bfm caps this one body itself
 * (`MOBILE_INVENTORY_MUTATIONS_MAX_BYTES`), well below what a batch of 50
 * mutations could otherwise reach.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { requires } from './capabilities.js';
import {
  MobileInventoryMediaBytesSchema,
  MobileInventoryMediaStoredSchema,
  MobileInventoryMediaUploadBodySchema,
  MobileInventoryMediaVariantSchema,
} from './mobile-inventory-media-schemas.js';
import {
  MobileCodeSuggestBodySchema,
  MobileCodeSuggestResponseSchema,
  MobileMutationsBodySchema,
  MobileMutationsResponseSchema,
} from './mobile-inventory-mutation-schemas.js';
import {
  MobileClientTooOldErrorSchema,
  MobileInventoryCatalogueSchema,
  MobileInventoryChangesSchema,
  MobileInventoryItemHistorySchema,
  MobileInventorySnapshotSchema,
  MobileResyncRequiredErrorSchema,
} from './mobile-inventory-schemas.js';
import {
  MOBILE_PERIMETER_RESPONSES,
  MOBILE_REQUEST_RESPONSES,
  MOBILE_UPSTREAM_RESPONSES,
} from './rest-mobile-responses.js';
import { MobilePayloadTooLargeErrorSchema, MobileUpstreamErrorSchema } from './rest-schemas.js';

const c = initContract();

/** The largest page this relay will ask inventory for, on any of its routes. */
const InventoryPageLimit = z.coerce.number().int().min(1).max(500).optional();

/**
 * The body cap `POST /mobile/inventory/mutations` is mounted with in `app.ts`
 * (`express.json({ limit })`, the same pattern the receipt upload uses).
 * Well above one mutation and well below the receipt upload's own ceiling:
 * a batch of 50 mutations is small, structured JSON with no photographs in
 * it, and this is the number a caller sending oversized `args` meets instead
 * of Express's 100kb default.
 */
export const MOBILE_INVENTORY_MUTATIONS_MAX_BYTES = 256 * 1024;

/**
 * The largest JSON body `PUT /mobile/inventory/media/:sha256` is mounted
 * with in `app.ts` (`express.json({ limit })`, the same pattern the receipt
 * upload uses).
 *
 * Sized around inventory's own 8 MB cap on the decoded bytes (its media
 * store's `MEDIA_UPLOAD_LIMIT_BYTES`): base64 inflates by a third, so 8 MB
 * of bytes is roughly 10.9 MB of
 * `dataBase64`, plus the small JSON envelope around it. The AUTHORITATIVE
 * cap is enforced in the handler against the decoded length before any
 * upstream call — this mount only has to be wide enough that a legitimate
 * upload is never truncated by Express's own body-size refusal first.
 */
export const MOBILE_INVENTORY_MEDIA_MAX_BYTES = 12 * 1024 * 1024;

/** Matches inventory's own `MEDIA_UPLOAD_LIMIT_BYTES` — see the constant above. */
export const MOBILE_INVENTORY_MEDIA_UPLOAD_LIMIT_BYTES = 8 * 1024 * 1024;

const SYNC_RESYNC_RESPONSES = {
  409: MobileResyncRequiredErrorSchema,
  426: MobileClientTooOldErrorSchema,
} as const;

export const mobileInventoryContract = c.router({
  catalogue: {
    method: 'GET',
    path: '/mobile/inventory/types',
    responses: {
      200: MobileInventoryCatalogueSchema,
      426: MobileClientTooOldErrorSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'The type catalogue: every type, field and unit the app needs to render an item',
    metadata: requires('inventory.read'),
  },
  snapshot: {
    method: 'GET',
    path: '/mobile/inventory/sync/snapshot',
    query: z.object({ cursor: z.string().optional(), limit: InventoryPageLimit }),
    responses: {
      200: MobileInventorySnapshotSchema,
      ...SYNC_RESYNC_RESPONSES,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary:
      'One page of live items and locations; the first page fixes the high-water seq the feed resumes from',
    metadata: requires('inventory.read'),
  },
  changes: {
    method: 'GET',
    path: '/mobile/inventory/sync/changes',
    query: z.object({
      since: z.coerce.number().int().min(0),
      epoch: z.string().min(1),
      limit: InventoryPageLimit,
    }),
    responses: {
      200: MobileInventoryChangesSchema,
      ...SYNC_RESYNC_RESPONSES,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'Rows and events changed after `since`, tombstones included, in seq order',
    metadata: requires('inventory.read'),
  },
  itemHistory: {
    method: 'GET',
    path: '/mobile/inventory/items/:id/history',
    pathParams: z.object({ id: z.string().min(1) }),
    query: z.object({ cursor: z.string().optional(), limit: InventoryPageLimit }),
    responses: {
      200: MobileInventoryItemHistorySchema,
      404: MobileUpstreamErrorSchema,
      426: MobileClientTooOldErrorSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: "One item's history, newest first",
    metadata: requires('inventory.read'),
  },
  mutations: {
    method: 'POST',
    path: '/mobile/inventory/mutations',
    body: MobileMutationsBodySchema,
    responses: {
      200: MobileMutationsResponseSchema,
      413: MobilePayloadTooLargeErrorSchema,
      426: MobileClientTooOldErrorSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'Apply up to 50 mutations in order, each in its own transaction, idempotently',
    metadata: requires('inventory.write'),
  },
  suggestCodes: {
    method: 'POST',
    path: '/mobile/inventory/codes/suggest',
    body: MobileCodeSuggestBodySchema,
    responses: {
      200: MobileCodeSuggestResponseSchema,
      426: MobileClientTooOldErrorSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'Free codes for a new item: a stem followed by the next unused numbers',
    metadata: requires('inventory.write'),
  },
  /**
   * Store a photo's bytes ahead of `item.attachPhoto` (A13). Capability
   * `inventory.write` on the same reasoning `mutations` carries it: this
   * writes into inventory's media store, even though nothing here touches
   * `item_photos` — that reference is a later mutation, once the phone knows
   * this call answered `alreadyStored` or created.
   *
   * No `409`/`426`: this route never reads the replica, so neither the
   * resync nor the protocol-version question inventory's sync surface
   * answers applies to it.
   */
  putMedia: {
    method: 'PUT',
    path: '/mobile/inventory/media/:sha256',
    pathParams: z.object({ sha256: z.string().min(1) }),
    body: MobileInventoryMediaUploadBodySchema,
    responses: {
      200: MobileInventoryMediaStoredSchema,
      201: MobileInventoryMediaStoredSchema,
      413: MobilePayloadTooLargeErrorSchema,
      415: MobileUpstreamErrorSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: "Store a photo's bytes, content-addressed by their own sha256",
    metadata: requires('inventory.write'),
  },
  /** The read half of {@link putMedia}. Capability `inventory.read`, matching every other GET here. */
  getMedia: {
    method: 'GET',
    path: '/mobile/inventory/media/:sha256',
    pathParams: z.object({ sha256: z.string().min(1) }),
    query: z.object({ variant: MobileInventoryMediaVariantSchema.optional() }),
    responses: {
      200: MobileInventoryMediaBytesSchema,
      404: MobileUpstreamErrorSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: "A photo's bytes, base64, for a detail screen or a thumbnail row",
    metadata: requires('inventory.read'),
  },
});

export type MobileInventoryContract = typeof mobileInventoryContract;
