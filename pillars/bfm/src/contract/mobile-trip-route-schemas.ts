import { z } from 'zod';

const Id = z.number().int().positive().safe();

/** A canonical Visit or Journey identity; names and source dates never determine placement. */
export const MobileTripRouteSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('visit'), id: Id }).strict(),
  z.object({ kind: z.literal('journey'), id: Id }).strict(),
]);

/** One explicit root membership, including persisted structural insertion gaps. */
export const MobileTripRouteItemSchema = z.union([
  MobileTripRouteSourceSchema,
  z.object({ kind: z.literal('gap'), id: Id }).strict(),
]);

/** An ordered alternative or applied historical path; history is not an active duplicate placement. */
export const MobileTripRoutePathSchema = z
  .object({
    id: Id,
    title: z.string(),
    gapId: Id,
    state: z.enum(['alternative', 'applied']),
    members: z.array(MobileTripRouteSourceSchema),
  })
  .strict();

/** The producer's mixed route at its own revision, retaining missing canonical source identities. */
export const MobileTripRouteSchema = z
  .object({
    tripId: Id,
    revision: z.number().int().nonnegative().safe(),
    order: z.array(MobileTripRouteItemSchema),
    paths: z.array(MobileTripRoutePathSchema),
    missingSources: z.array(MobileTripRouteSourceSchema),
  })
  .strict();

/** One canonical producer route read, independent of the legacy source-detail aggregate. */
export type MobileTripRoute = z.infer<typeof MobileTripRouteSchema>;
