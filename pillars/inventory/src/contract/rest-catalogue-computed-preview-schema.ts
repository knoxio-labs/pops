/**
 * Wire shape of the non-mutating "try on an item" preview of a draft computed
 * field. Each missing input's `reason` and the failure `code` are plain
 * strings for the same reason the sync wire keeps them open (Inventory
 * ADR-002 D10): the evaluator may learn a new cause without every client
 * shipping first, and a client phrases the ones it knows and shows the raw
 * code for the rest.
 */
import { z } from 'zod';

import {
  CatalogueDraftOperationSchema,
  ExpectedDraftVersionSchema,
} from './rest-catalogue-schemas.js';
import {
  SyncComputedDependencySchema,
  SyncComputedMissingInputSchema,
} from './rest-sync-computed-schemas.js';

const AnyJson = z.unknown();

/** The draft, the unsaved edits to apply first, and the field and item to evaluate. */
export const ComputedFieldPreviewBodySchema = z.object({
  baseRevision: z.number().int().positive(),
  expectedDraftVersion: ExpectedDraftVersionSchema,
  /** Unsaved operations applied, validated and rolled back around the evaluation. */
  operations: z.array(CatalogueDraftOperationSchema).max(100).default([]),
  typeId: z.uuid(),
  /** The computed field by id, or by key when it is new and not yet saved. */
  field: z.union([
    z.object({ id: z.uuid() }).strict(),
    z.object({ key: z.string().trim().min(1).max(100) }).strict(),
  ]),
  itemId: z.string().min(1),
});

const evaluated = {
  /** Every item/field revision read, in evaluation order. */
  dependencies: z.array(SyncComputedDependencySchema),
  /** The chosen item first, then every item a reference hop reached. */
  traversedItemIds: z.array(z.string()),
};

/** The raw evaluation outcome, before any wire degradation of errors. */
export const ComputedFieldPreviewResultSchema = z.discriminatedUnion('state', [
  z.object({ ...evaluated, state: z.literal('value'), value: AnyJson }),
  z.object({
    ...evaluated,
    state: z.literal('unavailable'),
    /**
     * Every input that had no value, the item it was read on, and why.
     * `coalesce` reports one per argument that had none.
     */
    missingInputs: z.array(SyncComputedMissingInputSchema).min(1),
  }),
  z.object({ ...evaluated, state: z.literal('error'), code: z.string() }),
]);

/** A draft computed field evaluated on one item; nothing was written. */
export const ComputedFieldPreviewResponseSchema = z.object({
  baseRevision: z.number().int().positive(),
  draftRevision: z.number().int().positive(),
  draftVersion: z.number().int().positive(),
  typeId: z.uuid(),
  fieldId: z.uuid(),
  itemId: z.string(),
  result: ComputedFieldPreviewResultSchema,
  /** The override the item holds for this field today, which the preview ignores. */
  override: AnyJson.nullable(),
  /** Names for every item the result mentions, in the order they were reached. */
  items: z.array(z.object({ id: z.string(), name: z.string(), typeId: z.string().nullable() })),
});
