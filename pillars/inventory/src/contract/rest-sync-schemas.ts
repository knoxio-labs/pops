/**
 * Wire shapes of the sync protocol (`rest-sync.ts`): the item, location and
 * event rows a snapshot or change-feed page carries, and the mutation batch.
 * camelCase throughout; an absent value is `null`, never a missing key.
 *
 * Values that may grow without a protocol bump (lifecycle, event kind, actor
 * kind, rejection reason) are plain strings here, so a client decodes an
 * unknown one instead of failing the whole page (Inventory ADR-002 D10). Vocabularies a
 * client must understand to render anything (placement kind, access) are
 * closed.
 */
import { z } from 'zod';

import { mutationSchema } from '../domain/commands/envelope.js';
import { conflictSourceSchema, outcomeWireSchema } from '../domain/commands/outcome.js';
import { placementSchema, previousPlacementSchema } from '../domain/commands/placement-schema.js';

/**
 * Any JSON value. Unconstrained rather than a recursive JSON schema, because
 * the recursive one projects to a self-referring type that openapi-typescript
 * emits and TypeScript rejects; clients decode it as an arbitrary value.
 */
const AnyJson = z.unknown();

/**
 * Where an item is: `{ kind: 'location', locationId }`,
 * `{ kind: 'container', itemId }` or `{ kind: 'hand' }`.
 */
export const SyncPlacementSchema = placementSchema;

/** Where an in-hand item was taken from (never `hand`), or `null`. */
export const SyncPreviousPlacementSchema = previousPlacementSchema;

/** One photo of an item, in display order, by content hash. */
export const SyncPhotoSchema = z.object({
  sha256: z.string(),
  caption: z.string().nullable(),
});

/** Purchase facts carried from the legacy columns; `null` when none is recorded. */
export const SyncProvenanceSchema = z.object({
  merchant: z.string().nullable(),
  price: z.number().nullable(),
  purchasedOn: z.string().nullable(),
  warrantyExpires: z.string().nullable(),
  transactionUri: z.string().nullable(),
});

/** One canonical, stable-ID field-value group returned by protocol 2. */
export const SyncItemFieldValueSchema = z.object({
  fieldId: z.uuid(),
  source: z.enum(['stored', 'override']),
  catalogueRevision: z.number().int().positive(),
  values: z.array(AnyJson),
});

/**
 * Whether an item has Paperless documents: `linked`, `none`, or `unavailable`
 * when it has links but Paperless could not be reached while the page was
 * built. Recomputed on every page, never cached as truth.
 */
export const DOCUMENTS_STATUSES = ['linked', 'none', 'unavailable'] as const;

/** An item as the phone's replica stores it. Tombstones carry `deletedAt`. */
export const SyncItemSchema = z.object({
  id: z.string(),
  revision: z.number().int(),
  seq: z.number().int(),
  name: z.string(),
  /** Stable persisted type identity. Present alongside `typeKey` for protocol-1 readers. */
  typeId: z.uuid().nullable(),
  /** The catalogue revision shared by every current value, when one exists. */
  catalogueRevision: z.number().int().positive().nullable(),
  typeKey: z.string().nullable(),
  legacyType: z.string().nullable(),
  /** Canonical stable-ID values; `fields` remains the protocol-1 compatibility projection. */
  fieldValues: z.array(SyncItemFieldValueSchema),
  fields: z.record(z.string(), AnyJson),
  note: z.string().nullable(),
  code: z.string().nullable(),
  externalIds: z.array(z.object({ kind: z.string(), value: z.string() })),
  quantity: z.number().int(),
  lifecycle: z.string(),
  lifecycleChangedAt: z.string().nullable(),
  placement: SyncPlacementSchema,
  previousPlacement: SyncPreviousPlacementSchema,
  isContainer: z.boolean(),
  access: z.enum(['open', 'closed']).nullable(),
  isFull: z.boolean().nullable(),
  photos: z.array(SyncPhotoSchema),
  provenance: SyncProvenanceSchema.nullable(),
  documentsStatus: z.enum(DOCUMENTS_STATUSES),
  documentTitles: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

/** A place in the tree. Tombstones carry `deletedAt`. */
export const SyncLocationSchema = z.object({
  id: z.string(),
  revision: z.number().int(),
  seq: z.number().int(),
  name: z.string(),
  parentId: z.string().nullable(),
  sortOrder: z.number().int(),
  deletedAt: z.string().nullable(),
});

/**
 * An event's `before` or `after`: the touched fields' values keyed by their
 * wire name. `placement` and `previousPlacement` have their row shapes (a
 * move records both, so a revert of a pick-up restores where the item came
 * from); every other key holds the JSON value the field has on
 * `SyncItemSchema` or `SyncLocationSchema`, or `photos` as an array of hashes.
 * A key is present only when the event touched that field.
 */
export const SyncEventValuesSchema = z
  .object({
    placement: SyncPlacementSchema.optional(),
    previousPlacement: SyncPreviousPlacementSchema.optional(),
  })
  .catchall(AnyJson);

/**
 * One history entry. `actor.label` is the device's own label for a phone and
 * "Server" for anything else; `undoable` is whether `event.revert` of it would
 * be accepted now (a revertible kind, and the latest change to every field it
 * touched).
 */
export const SyncEventSchema = z.object({
  seq: z.number().int(),
  entityKind: z.enum(['item', 'location']),
  entityId: z.string(),
  kind: z.string(),
  fields: z.array(z.string()),
  before: SyncEventValuesSchema,
  after: SyncEventValuesSchema,
  reason: z.string().nullable(),
  actor: conflictSourceSchema,
  clientTime: z.string().nullable(),
  serverTime: z.string(),
  compensatesSeq: z.number().int().nullable(),
  undoable: z.boolean(),
});

/** The largest mutation batch one request may carry. */
export const MAX_MUTATION_BATCH = 50;

/** `POST /sync/mutations` body: mutations applied in array order, each on its own. */
export const SyncMutationsBodySchema = z.object({
  mutations: z.array(mutationSchema).min(1).max(MAX_MUTATION_BATCH),
});

/** One outcome per mutation, in request order, and the change sequence after the batch. */
export const SyncMutationsResponseSchema = z.object({
  outcomes: z.array(outcomeWireSchema),
  highWaterSeq: z.number().int(),
});
