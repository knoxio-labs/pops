/**
 * `/mobile/inventory/*` — bfm's relay of the inventory pillar's sync protocol
 * (Inventory ADR-002 D9/D10, `pillars/inventory/src/contract/rest-sync.ts`).
 *
 * Read routes only (slice A9): the type catalogue, the paged snapshot, the
 * change feed and one item's history. Mutations and code suggestions are a
 * later slice, on the same reasoning `purchases.write` is declared apart from
 * `purchases.read` — writing is its own authority.
 *
 * `409` and `426` are declared here, on every route, because the producer can
 * answer either on any of them:
 *
 * - `409` (`resync_required`) — the producer's epoch or high-water mark moved
 *   out from under this replica; the app's recovery is to discard its local
 *   replica and re-snapshot.
 * - `426` (`client_too_old`) — never actually reaches a handler's typed
 *   return; see `api/rest/inventory-protocol-error.ts` for why.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { requires } from './capabilities.js';
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
import { MobileUpstreamErrorSchema } from './rest-schemas.js';

const c = initContract();

/** The largest page this relay will ask inventory for, on any of its routes. */
const InventoryPageLimit = z.coerce.number().int().min(1).max(500).optional();

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
});

export type MobileInventoryContract = typeof mobileInventoryContract;
