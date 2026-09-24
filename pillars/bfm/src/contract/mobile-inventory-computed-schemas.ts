/**
 * A computed field's effective value on a mobile inventory item, mirrored
 * from the inventory pillar's `rest-sync-computed-schemas.ts` for the reason
 * `mobile-inventory-schemas.ts` gives. `state` is closed: the app must know
 * it to draw the field at all. `reason` is a plain string, so a new
 * unavailability cause decodes instead of failing the page.
 */
import { z } from 'zod';

const AnyJson = z.unknown();

/**
 * One input an unavailable evaluation lacked: `fieldId` on `itemId`, and why.
 * Optional on the relay so an inventory pillar that predates it still decodes.
 */
export const MobileInventoryComputedMissingInputSchema = z.object({
  reason: z.string(),
  fieldId: z.uuid(),
  itemId: z.string(),
});

/** One item/field revision an evaluation read; a newer local revision means the value is stale. */
export const MobileInventoryComputedDependencySchema = z.object({
  itemId: z.string(),
  fieldId: z.uuid(),
  revision: z.number().int(),
});

const computedBase = {
  fieldId: z.uuid(),
  source: z.literal('computed'),
  catalogueRevision: z.number().int().positive(),
  dependencies: z.array(MobileInventoryComputedDependencySchema),
  traversedItemIds: z.array(z.string()),
};

/** `ok`, `overridden` (an explicit override supersedes the expression) or `unavailable`. */
export const MobileInventoryComputedValueSchema = z.discriminatedUnion('state', [
  z.object({ ...computedBase, state: z.literal('ok'), values: z.array(AnyJson).length(1) }),
  z.object({
    ...computedBase,
    state: z.literal('overridden'),
    values: z.array(AnyJson).length(1),
    override: z.object({ catalogueRevision: z.number().int().positive() }),
  }),
  z.object({
    ...computedBase,
    state: z.literal('unavailable'),
    reason: z.string(),
    failedFieldId: z.uuid(),
    /** Every input without a value (a `coalesce` names each argument's); empty for `evaluation_error`. */
    missingInputs: z.array(MobileInventoryComputedMissingInputSchema).optional(),
  }),
]);

/** One computed field's effective value as the phone receives it. */
export type MobileInventoryComputedValue = z.infer<typeof MobileInventoryComputedValueSchema>;
