/**
 * The placement shapes on their own, depending on nothing but zod, so the
 * sync contract (`src/contract/rest-sync-schemas.ts`) can declare them
 * without importing the database layer that `item-fields.ts` needs.
 */
import { z } from 'zod';

/** Where an item is, as the wire and the event log spell it. */
export const placementSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('location'), locationId: z.string().min(1) }),
  z.object({ kind: z.literal('container'), itemId: z.string().min(1) }),
  z.object({ kind: z.literal('hand') }),
]);
/** A value of {@link placementSchema}. */
export type Placement = z.infer<typeof placementSchema>;

/** The place an in-hand item was taken from; never itself `hand`. */
export const previousPlacementSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('location'), locationId: z.string().min(1) }),
    z.object({ kind: z.literal('container'), itemId: z.string().min(1) }),
  ])
  .nullable();
/** A value of {@link previousPlacementSchema}. */
export type PreviousPlacement = z.infer<typeof previousPlacementSchema>;
