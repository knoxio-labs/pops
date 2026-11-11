import { z } from 'zod';

const Id = z.number().int().positive().safe();
const Revision = z.number().int().nonnegative().safe();
/** A canonical trip-owned source; equal place names never identify equal Visits. */
export const RouteSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('visit'), id: Id }).strict(),
  z.object({ kind: z.literal('journey'), id: Id }).strict(),
]);
/** Explicit flat root membership, including persisted insertion gaps without invented transport. */
export const RouteItemSchema = z.union([
  RouteSourceSchema,
  z.object({ kind: z.literal('gap'), id: Id }).strict(),
]);
/** Ordered alternative membership; applied paths retain historical identity rather than active duplicate placement. */
export const RoutePathSchema = z
  .object({
    id: Id,
    title: z.string(),
    gapId: Id,
    state: z.enum(['alternative', 'applied']),
    members: z.array(RouteSourceSchema),
  })
  .strict();
/** One authoritative route aggregate; source dates, bookings and endpoint facts are independent. */
export const TripRouteSchema = z
  .object({
    tripId: Id,
    revision: Revision,
    order: z.array(RouteItemSchema),
    paths: z.array(RoutePathSchema),
  })
  .strict();
const Destination = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('route'), before: RouteItemSchema.nullable() }).strict(),
  z.object({ kind: z.literal('path'), pathId: Id, before: RouteSourceSchema.nullable() }).strict(),
]);
/** UUID retries are immutable; each new command CASes the aggregate and Undo names its own confirmed receipt. */
export const RouteOperationSchema = z
  .object({
    operationId: z.uuid(),
    expectedRevision: Revision,
    command: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('gap.create'), before: RouteItemSchema.nullable() }).strict(),
      z
        .object({
          kind: z.literal('source.move'),
          source: RouteSourceSchema,
          destination: Destination,
        })
        .strict(),
      z.object({ kind: z.literal('route.reorder'), order: z.array(RouteItemSchema) }).strict(),
      z
        .object({
          kind: z.literal('path.create'),
          title: z.string(),
          gapId: Id,
          members: z.array(RouteSourceSchema),
        })
        .strict(),
      z
        .object({
          kind: z.literal('path.reorder'),
          pathId: Id,
          members: z.array(RouteSourceSchema),
        })
        .strict(),
      z.object({ kind: z.literal('path.apply'), pathId: Id }).strict(),
      z.object({ kind: z.literal('undo'), targetOperationId: z.uuid() }).strict(),
    ]),
  })
  .strict();
/** Immutable source-preserving outcome; newer reads never retroactively acknowledge an operation. */
export const RouteReceiptSchema = z.object({
  operationId: z.uuid(),
  undoneOperationId: z.uuid().nullable(),
  before: TripRouteSchema,
  after: TripRouteSchema,
});
/** Current route and source availability are separate from historical retry/Undo receipts. */
export const RouteOperationResultSchema = z.object({
  receipt: RouteReceiptSchema,
  current: TripRouteSchema,
  undone: z.boolean(),
  replayed: z.boolean(),
});
/** Read projection retains missing identities for explicit repair instead of silently dropping memberships. */
export const TripRouteReadSchema = TripRouteSchema.extend({
  missingSources: z.array(RouteSourceSchema),
});
/** Canonical Visit or Journey identity. */
export type RouteSource = z.infer<typeof RouteSourceSchema>;
/** Root source or structural insertion gap. */
export type RouteItem = z.infer<typeof RouteItemSchema>;
/** Alternative or historical applied complete path. */
export type RoutePath = z.infer<typeof RoutePathSchema>;
/** Authoritative route snapshot at one aggregate revision. */
export type TripRoute = z.infer<typeof TripRouteSchema>;
/** Guarded replayable route mutation. */
export type RouteOperation = z.infer<typeof RouteOperationSchema>;
/** Immutable route mutation outcome. */
export type RouteReceipt = z.infer<typeof RouteReceiptSchema>;
/** Replay outcome plus current facts. */
export type RouteOperationResult = z.infer<typeof RouteOperationResultSchema>;
/** Live route plus explicit missing canonical references. */
export type TripRouteRead = z.infer<typeof TripRouteReadSchema>;
