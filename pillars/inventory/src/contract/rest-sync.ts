/**
 * The sync protocol (Inventory ADR-002 D9 and D10): a paged snapshot pinned to
 * a high-water `seq`, a change feed after a `seq`, per-item history, batched
 * idempotent mutations, the type catalogue and code suggestions. bfm relays it
 * under `/mobile/inventory/*`; the web may call it directly.
 *
 * Three sub-routers so the scope gate (`middleware/service-account-scope.ts`)
 * derives three grants from their keys: `inventory.sync`, `inventory.types`
 * and `inventory.codes`.
 *
 * Every sync route requires `Pops-Inventory-Protocol: <n>`; a missing header or one
 * below the server's minimum is `426 client_too_old`. `POST /sync/mutations`
 * also reads `Pops-Actor: device:<deviceId>;label=<percent-encoded label>`,
 * honoured only from a caller whose service account holds `inventory.sync`;
 * anyone else is recorded as `web` (no key) or `service:<account>`.
 *
 * Cursors are opaque base64url strings the client echoes unmodified; one this
 * server did not issue is `400 invalid_cursor`. A snapshot cursor or feed
 * `since` from another epoch, or a `since` above the server's latest `seq`, is
 * `409 resync_required`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { inventoryCatalogueContract } from './rest-catalogue.js';
import { ErrorBodySchema, NonEmptyString } from './rest-schemas.js';
import {
  SyncEventSchema,
  SyncItemSchema,
  SyncLocationSchema,
  SyncMutationsBodySchema,
  SyncMutationsResponseSchema,
} from './rest-sync-schemas.js';

const c = initContract();

const PROTOCOL_1_FIELD_KINDS = ['text', 'choice', 'flag', 'measurement', 'range', 'link'] as const;
const PROTOCOL_1_DIMENSIONS = [
  'length',
  'mass',
  'volume',
  'power',
  'voltage',
  'data-rate',
  'brightness',
  'colour-temperature',
] as const;
const PROTOCOL_1_TYPE_CAPABILITIES = ['containment'] as const;

/** The protocol header every sync route requires, lower-cased as Express reads it. */
export const PROTOCOL_HEADER = 'pops-inventory-protocol';
/** The acting-device header `POST /sync/mutations` honours from `inventory.sync` callers. */
export const ACTOR_HEADER = 'pops-actor';

const ProtocolHeaders = z.object({
  [PROTOCOL_HEADER]: z.string().optional(),
});

const MutationHeaders = ProtocolHeaders.extend({
  [ACTOR_HEADER]: z.string().optional(),
});

/** 400 for a malformed request, cursor or header; 426 for a client below the minimum protocol. */
const SYNC_ERRORS = { 400: ErrorBodySchema, 426: ErrorBodySchema } as const;

const PageLimit = z.coerce.number().int().min(1).max(500).default(250);

const SnapshotResponse = z.object({
  epoch: z.string(),
  highWaterSeq: z.number().int(),
  catalogueVersion: z.string(),
  total: z.number().int(),
  items: z.array(SyncItemSchema),
  locations: z.array(SyncLocationSchema),
  nextCursor: z.string().nullable(),
});

const ChangesResponse = z.object({
  epoch: z.string(),
  items: z.array(SyncItemSchema),
  locations: z.array(SyncLocationSchema),
  events: z.array(SyncEventSchema),
  nextSince: z.number().int(),
  hasMore: z.boolean(),
  catalogueVersion: z.string(),
});

const HistoryResponse = z.object({
  events: z.array(SyncEventSchema),
  nextCursor: z.string().nullable(),
});

export const inventorySyncContract = c.router({
  snapshot: {
    method: 'GET',
    path: '/sync/snapshot',
    headers: ProtocolHeaders,
    query: z.object({ cursor: z.string().optional(), limit: PageLimit }),
    responses: { 200: SnapshotResponse, 409: ErrorBodySchema, ...SYNC_ERRORS },
    summary:
      'One page of live items and locations; the first page fixes the high-water seq the feed resumes from',
  },
  changes: {
    method: 'GET',
    path: '/sync/changes',
    headers: ProtocolHeaders,
    query: z.object({
      since: z.coerce.number().int().min(0),
      epoch: NonEmptyString,
      limit: PageLimit,
    }),
    responses: { 200: ChangesResponse, 409: ErrorBodySchema, ...SYNC_ERRORS },
    summary: 'Rows and events changed after `since`, tombstones included, in seq order',
  },
  itemEvents: {
    method: 'GET',
    path: '/sync/items/:id/events',
    headers: ProtocolHeaders,
    pathParams: z.object({ id: NonEmptyString }),
    query: z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
    responses: { 200: HistoryResponse, 404: ErrorBodySchema, ...SYNC_ERRORS },
    summary: "An item's history, newest first",
  },
  mutations: {
    method: 'POST',
    path: '/sync/mutations',
    headers: MutationHeaders,
    body: SyncMutationsBodySchema,
    responses: { 200: SyncMutationsResponseSchema, ...SYNC_ERRORS },
    summary: 'Apply up to 50 mutations in order, each in its own transaction, idempotently',
  },
});

const CatalogueFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  kind: z.enum(PROTOCOL_1_FIELD_KINDS),
  hint: z.string().optional(),
  choices: z.array(z.string()).optional(),
  dimension: z.enum(PROTOCOL_1_DIMENSIONS).optional(),
  unit: z.string().optional(),
  highlighted: z.boolean().optional(),
  required: z.boolean().optional(),
});

/** The type catalogue descriptor (Inventory ADR-002 D5); `version` is a content hash. */
export const CatalogueDescriptorSchema = z.object({
  version: z.string(),
  units: z.array(
    z.object({
      symbol: z.string(),
      dimension: z.enum(PROTOCOL_1_DIMENSIONS),
      multiplier: z.number(),
    })
  ),
  types: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      capabilities: z.array(z.enum(PROTOCOL_1_TYPE_CAPABILITIES)),
      fields: z.array(CatalogueFieldSchema),
      legacyLabels: z.array(z.string()),
    })
  ),
});

export const inventoryTypesContract = c.router({
  catalogue: {
    method: 'GET',
    path: '/types',
    headers: ProtocolHeaders.extend({ 'if-none-match': z.string().optional() }),
    responses: { 200: CatalogueDescriptorSchema, 304: c.noBody(), ...SYNC_ERRORS },
    summary: 'The type catalogue; `ETag` is its version, and a matching `If-None-Match` is 304',
  },
  ...inventoryCatalogueContract,
});

export const inventoryCodesContract = c.router({
  suggest: {
    method: 'POST',
    path: '/codes/suggest',
    headers: ProtocolHeaders,
    body: z.object({
      name: z.string().trim().min(1).max(200),
      typeKey: z.string().min(1).optional(),
      stem: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9-]{0,15}[A-Za-z-]$/)
        .optional(),
    }),
    responses: { 200: z.object({ suggestions: z.array(z.string()) }), ...SYNC_ERRORS },
    summary: 'Free codes for a new item: a stem followed by the next unused numbers',
  },
});

/**
 * The three sub-routers that make up the sync protocol, keyed as the contract
 * mounts them; the protocol-header gate derives the paths it guards from this.
 */
export const inventorySyncProtocolRouters = {
  sync: inventorySyncContract,
  types: { catalogue: inventoryTypesContract.catalogue },
  codes: inventoryCodesContract,
};
