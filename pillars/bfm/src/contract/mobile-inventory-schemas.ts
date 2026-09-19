/**
 * Wire shapes for `/mobile/inventory/*` — bfm's relay of the inventory
 * pillar's sync protocol (its own `src/contract/rest-sync-schemas.ts`).
 *
 * Mirrored rather than imported: bfm has no build-time dependency on the
 * inventory pillar (each pillar is discovered over its published OpenAPI, not
 * linked as a package — the same reasoning `api/finance/wire.ts` states for
 * money). The inventory pillar built this protocol to be relayed as-is
 * (`rest-sync.ts`: "bfm relays it under /mobile/inventory/*"), so the mobile
 * shape here tracks the producer's field-for-field rather than reshaping it
 * the way `finance`/`purchases` are reshaped — `api/inventory/wire.ts`
 * validates what comes back against these schemas rather than trusting it.
 *
 * Vocabularies that may grow without a wire-contract bump on the producer
 * side (lifecycle, event kind, actor kind, field kind, dimension, type
 * capability) stay plain strings here, the same choice the producer's own
 * wire makes for the same reason: a build already on a handset must decode a
 * page carrying a value it has never heard of instead of failing the whole
 * page. `placement`'s `kind` and `documentsStatus` are the vocabularies a
 * client must understand to render anything at all, so those stay closed.
 */
import { z } from 'zod';

const AnyJson = z.unknown();

/** Where an item is: a location, inside a container item, or in hand. */
export const MobileInventoryPlacementSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('location'), locationId: z.string() }),
  z.object({ kind: z.literal('container'), itemId: z.string() }),
  z.object({ kind: z.literal('hand') }),
]);

export type MobileInventoryPlacement = z.infer<typeof MobileInventoryPlacementSchema>;

/** Where an in-hand item was taken from (never `hand`), or `null`. */
export const MobileInventoryPreviousPlacementSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('location'), locationId: z.string() }),
    z.object({ kind: z.literal('container'), itemId: z.string() }),
  ])
  .nullable();

export type MobileInventoryPreviousPlacement = z.infer<
  typeof MobileInventoryPreviousPlacementSchema
>;

/** One photo of an item, in display order, by content hash. */
export const MobileInventoryPhotoSchema = z.object({
  sha256: z.string(),
  caption: z.string().nullable(),
});

/** Purchase facts carried from the legacy columns; `null` when none is recorded. */
export const MobileInventoryProvenanceSchema = z.object({
  merchant: z.string().nullable(),
  price: z.number().nullable(),
  purchasedOn: z.string().nullable(),
  warrantyExpires: z.string().nullable(),
  transactionUri: z.string().nullable(),
});

/**
 * Whether an item has Paperless documents. Closed: the app draws one of three
 * fixed states rather than a label it has never seen.
 */
export const MOBILE_INVENTORY_DOCUMENTS_STATUSES = ['linked', 'none', 'unavailable'] as const;

export const MobileInventoryDocumentsStatusSchema = z.enum(MOBILE_INVENTORY_DOCUMENTS_STATUSES);

/** An item as the phone's replica stores it. Tombstones carry `deletedAt`. */
export const MobileInventoryItemSchema = z.object({
  id: z.string(),
  revision: z.number().int(),
  seq: z.number().int(),
  name: z.string(),
  typeKey: z.string().nullable(),
  /** The free-text type an item had before types existed; read-only, matched against a type's `legacyLabels`. */
  legacyType: z.string().nullable(),
  fields: z.record(z.string(), AnyJson),
  note: z.string().nullable(),
  code: z.string().nullable(),
  externalIds: z.array(z.object({ kind: z.string(), value: z.string() })),
  quantity: z.number().int(),
  lifecycle: z.string(),
  lifecycleChangedAt: z.string().nullable(),
  placement: MobileInventoryPlacementSchema,
  previousPlacement: MobileInventoryPreviousPlacementSchema,
  isContainer: z.boolean(),
  access: z.enum(['open', 'closed']).nullable(),
  isFull: z.boolean().nullable(),
  photos: z.array(MobileInventoryPhotoSchema),
  provenance: MobileInventoryProvenanceSchema.nullable(),
  documentsStatus: MobileInventoryDocumentsStatusSchema,
  documentTitles: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

export type MobileInventoryItem = z.infer<typeof MobileInventoryItemSchema>;

/** A place in the tree. Tombstones carry `deletedAt`. */
export const MobileInventoryLocationSchema = z.object({
  id: z.string(),
  revision: z.number().int(),
  seq: z.number().int(),
  name: z.string(),
  parentId: z.string().nullable(),
  sortOrder: z.number().int(),
  deletedAt: z.string().nullable(),
});

export type MobileInventoryLocation = z.infer<typeof MobileInventoryLocationSchema>;

/**
 * An event's `before` or `after`. `placement`/`previousPlacement` have their
 * row shapes; every other touched field holds whatever JSON value it carries
 * on {@link MobileInventoryItemSchema} or {@link MobileInventoryLocationSchema}.
 */
export const MobileInventoryEventValuesSchema = z
  .object({
    placement: MobileInventoryPlacementSchema.optional(),
    previousPlacement: MobileInventoryPreviousPlacementSchema.optional(),
  })
  .catchall(AnyJson);

/** Who or what made a change: a device (by label) or the server. */
export const MobileInventoryActorSchema = z.object({
  kind: z.string(),
  label: z.string(),
});

/** One history entry, newest first on the wire. */
export const MobileInventoryEventSchema = z.object({
  seq: z.number().int(),
  entityKind: z.enum(['item', 'location']),
  entityId: z.string(),
  kind: z.string(),
  fields: z.array(z.string()),
  before: MobileInventoryEventValuesSchema,
  after: MobileInventoryEventValuesSchema,
  reason: z.string().nullable(),
  actor: MobileInventoryActorSchema,
  clientTime: z.string().nullable(),
  serverTime: z.string(),
  compensatesSeq: z.number().int().nullable(),
  undoable: z.boolean(),
});

export type MobileInventoryEvent = z.infer<typeof MobileInventoryEventSchema>;

/** One field of a catalogue type. */
export const MobileInventoryCatalogueFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  kind: z.string(),
  hint: z.string().optional(),
  choices: z.array(z.string()).optional(),
  dimension: z.string().optional(),
  unit: z.string().optional(),
  highlighted: z.boolean().optional(),
  required: z.boolean().optional(),
});

/** The type catalogue: every type and unit the app needs to render an item. */
export const MobileInventoryCatalogueSchema = z.object({
  version: z.string(),
  units: z.array(z.object({ symbol: z.string(), dimension: z.string(), multiplier: z.number() })),
  types: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      capabilities: z.array(z.string()),
      fields: z.array(MobileInventoryCatalogueFieldSchema),
      legacyLabels: z.array(z.string()),
    })
  ),
});

export type MobileInventoryCatalogue = z.infer<typeof MobileInventoryCatalogueSchema>;

/** One page of the initial snapshot, pinned to the high-water `seq`. */
export const MobileInventorySnapshotSchema = z.object({
  epoch: z.string(),
  highWaterSeq: z.number().int(),
  catalogueVersion: z.string(),
  total: z.number().int(),
  items: z.array(MobileInventoryItemSchema),
  locations: z.array(MobileInventoryLocationSchema),
  nextCursor: z.string().nullable(),
});

export type MobileInventorySnapshot = z.infer<typeof MobileInventorySnapshotSchema>;

/** One page of the change feed after `since`. */
export const MobileInventoryChangesSchema = z.object({
  epoch: z.string(),
  items: z.array(MobileInventoryItemSchema),
  locations: z.array(MobileInventoryLocationSchema),
  events: z.array(MobileInventoryEventSchema),
  nextSince: z.number().int(),
  hasMore: z.boolean(),
  catalogueVersion: z.string(),
});

export type MobileInventoryChanges = z.infer<typeof MobileInventoryChangesSchema>;

/** One page of one item's history, newest first. */
export const MobileInventoryItemHistorySchema = z.object({
  events: z.array(MobileInventoryEventSchema),
  nextCursor: z.string().nullable(),
});

export type MobileInventoryItemHistory = z.infer<typeof MobileInventoryItemHistorySchema>;

/**
 * The producer's epoch or high-water mark moved out from under this replica.
 * The app's recovery is to discard its local replica and re-snapshot, not to
 * retry the same request.
 */
export const MobileResyncRequiredErrorSchema = z.object({
  code: z.literal('resync_required'),
  message: z.string(),
});

export type MobileResyncRequiredError = z.infer<typeof MobileResyncRequiredErrorSchema>;

/**
 * This build's `Pops-Inventory-Protocol` is below what the inventory pillar
 * now serves. Answered outside the normal typed response path — see
 * `api/rest/inventory-protocol-error.ts` for why 426 needs its own error
 * handler rather than a handler return value.
 */
export const MobileClientTooOldErrorSchema = z.object({
  code: z.literal('client_too_old'),
  message: z.string(),
});

export type MobileClientTooOldError = z.infer<typeof MobileClientTooOldErrorSchema>;
