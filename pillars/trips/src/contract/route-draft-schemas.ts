import { z } from 'zod';

import { RouteReceiptSchema, TripRouteSchema } from './route-schemas.js';

const Id = z.number().int().positive().safe();
const Revision = z.number().int().nonnegative().safe();
const Fingerprint = z.string().regex(/^[a-f0-9]{64}$/);

/** Typed source identity; Journey-leg IDs are namespaced by their owning Journey. */
export const RouteDraftSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('visit'), id: Id }).strict(),
  z.object({ kind: z.literal('journey'), id: Id }).strict(),
  z.object({ kind: z.literal('journey-leg'), journeyId: Id, id: Id }).strict(),
  z.object({ kind: z.literal('stay'), id: Id }).strict(),
  z.object({ kind: z.literal('event'), id: Id }).strict(),
  z.object({ kind: z.literal('rental'), id: Id }).strict(),
  z.object({ kind: z.literal('meeting'), id: Id }).strict(),
]);

const Selection = z.array(RouteDraftSourceSchema).superRefine((sources, context) => {
  const seen = new Set<string>();
  sources.forEach((source, index) => {
    const key =
      source.kind === 'journey-leg'
        ? `${source.kind}:${source.journeyId}:${source.id}`
        : `${source.kind}:${source.id}`;
    if (seen.has(key))
      context.addIssue({ code: 'custom', message: 'Duplicate source identity', path: [index] });
    seen.add(key);
  });
});

/** Canonical confirmation axis and its persisted value, including an unset value. */
export const RouteDraftFactSchema = z
  .object({
    field: z.enum(['status', 'arrangement', 'purchase', 'agreement']),
    value: z.string().nullable(),
  })
  .strict();

/** Guarded candidate with explicit selection, confirmation and retention reasons. */
export const RouteDraftCandidateSchema = z
  .object({
    source: RouteDraftSourceSchema,
    version: Fingerprint,
    confirmed: z.boolean(),
    selected: z.boolean(),
    disposition: z.enum(['remove', 'retain']),
    reasons: z.array(z.enum(['confirmed', 'shared', 'context', 'not-selected'])),
    facts: z.array(RouteDraftFactSchema),
  })
  .strict();

/** Explicit source selection for a read-only deletion preview. */
export const RouteDraftPreviewInputSchema = z
  .object({ deleteSources: Selection.optional() })
  .strict();

/** Snapshot-bound deletion plan; committing requires its exact fingerprint and selection. */
export const RouteDraftPreviewSchema = z
  .object({
    tripId: Id,
    pathId: Id,
    revision: Revision,
    fingerprint: Fingerprint,
    candidates: z.array(RouteDraftCandidateSchema),
    selection: Selection,
  })
  .strict();

/** Dedicated destructive capability with immutable UUID replay and source-aware Undo. */
export const RouteDraftOperationSchema = z
  .object({
    operationId: z.uuid(),
    expectedRevision: Revision,
    command: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('path.delete'),
          pathId: Id,
          expectedPreviewFingerprint: Fingerprint,
          deleteSources: Selection,
        })
        .strict(),
      z.object({ kind: z.literal('undo'), targetOperationId: z.uuid() }).strict(),
    ]),
  })
  .strict();

/** Immutable route outcome plus the source deletion plan owned by this operation. */
export const RouteDraftReceiptSchema = RouteReceiptSchema.extend({
  deletion: z
    .object({
      pathId: Id,
      fingerprint: Fingerprint,
      candidates: z.array(RouteDraftCandidateSchema),
    })
    .strict(),
}).strict();

/** Historical proof and current source lifecycle are distinct on replay and Undo. */
export const RouteDraftOperationResultSchema = z
  .object({
    receipt: RouteDraftReceiptSchema,
    current: TripRouteSchema,
    currentSources: z.array(
      z
        .object({
          source: RouteDraftSourceSchema,
          state: z.enum(['active', 'removed', 'missing']),
          version: Fingerprint.nullable(),
        })
        .strict()
    ),
    undone: z.boolean(),
    replayed: z.boolean(),
  })
  .strict();

/** Canonical typed source identity. */
export type RouteDraftSource = z.infer<typeof RouteDraftSourceSchema>;
/** Canonical candidate and its guarded disposition. */
export type RouteDraftCandidate = z.infer<typeof RouteDraftCandidateSchema>;
/** Explicit preview selection. */
export type RouteDraftPreviewInput = z.infer<typeof RouteDraftPreviewInputSchema>;
/** Snapshot-bound preview. */
export type RouteDraftPreview = z.infer<typeof RouteDraftPreviewSchema>;
/** Replayable dedicated draft mutation. */
export type RouteDraftOperation = z.infer<typeof RouteDraftOperationSchema>;
/** Immutable source-aware outcome. */
export type RouteDraftReceipt = z.infer<typeof RouteDraftReceiptSchema>;
/** Immutable receipt plus current lifecycle facts. */
export type RouteDraftOperationResult = z.infer<typeof RouteDraftOperationResultSchema>;
