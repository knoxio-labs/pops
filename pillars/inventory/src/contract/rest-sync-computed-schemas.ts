/**
 * Wire shape of a computed field's effective value on a sync or web item.
 *
 * `fieldValues` carries what commands persist (stored values and overrides);
 * `computedValues` carries what the server derives from them, one entry per
 * computed field of the item's type under the active catalogue. `state` is
 * closed because a client must understand it to render the field; `reason` is
 * a plain string because new unavailability causes may ship without a
 * protocol bump (Inventory ADR-002 D10).
 */
import { z } from 'zod';

const AnyJson = z.unknown();

/** One item/field revision an evaluation read; a newer revision makes the value stale. */
export const SyncComputedDependencySchema = z.object({
  itemId: z.string(),
  fieldId: z.uuid(),
  revision: z.number().int(),
});

const computedBase = {
  fieldId: z.uuid(),
  source: z.literal('computed'),
  /** The catalogue revision whose expression produced this entry. */
  catalogueRevision: z.number().int().positive(),
  /** Every item/field revision read, in evaluation order; empty when overridden. */
  dependencies: z.array(SyncComputedDependencySchema),
  /** The root item and every item a reference hop reached; empty when overridden. */
  traversedItemIds: z.array(z.string()),
};

/**
 * `ok`: the expression's value. `overridden`: an explicit override supersedes
 * the expression, which is not evaluated. `unavailable`: the expression could
 * not produce a value, and why.
 */
export const SyncComputedValueSchema = z.discriminatedUnion('state', [
  z.object({ ...computedBase, state: z.literal('ok'), values: z.array(AnyJson).length(1) }),
  z.object({
    ...computedBase,
    state: z.literal('overridden'),
    values: z.array(AnyJson).length(1),
    /** The catalogue revision the override was written against. */
    override: z.object({ catalogueRevision: z.number().int().positive() }),
  }),
  z.object({
    ...computedBase,
    state: z.literal('unavailable'),
    reason: z.string(),
    /** The field whose value was missing or failed: a dependency, or this field itself. */
    failedFieldId: z.uuid(),
  }),
]);

/** One computed field's effective value on the wire. */
export type SyncComputedValue = z.infer<typeof SyncComputedValueSchema>;
