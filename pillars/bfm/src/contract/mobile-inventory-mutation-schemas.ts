/**
 * Wire shapes for `/mobile/inventory/mutations` and
 * `/mobile/inventory/codes/suggest` (A12) — kept apart from
 * `mobile-inventory-schemas.ts` (the read routes, A9) so neither file grows
 * past `check-line-budget-headroom`'s cap; both mirror the inventory
 * pillar's own `src/contract/rest-sync-schemas.ts` field for field, for the
 * same reason and by the same rule that file's header states.
 */
import { z } from 'zod';

/**
 * One mutation as the phone sends it, mirroring inventory's own
 * `domain/commands/envelope.ts#mutationSchema` field for field — `args` is
 * opaque JSON here too, validated by the op it names once inventory receives
 * it, not by this relay.
 */
export const MobileMutationSchema = z.object({
  mutationId: z.uuid(),
  op: z.string().min(1).max(64),
  entityId: z.string().min(1).max(128),
  baseRevision: z.number().int().min(1).nullish(),
  dependsOn: z.array(z.uuid()).max(50).default([]),
  clientTime: z.iso.datetime({ offset: true }),
  args: z.unknown(),
});

export type MobileMutation = z.infer<typeof MobileMutationSchema>;

/** The largest batch one request may carry, mirroring inventory's own `MAX_MUTATION_BATCH`. */
export const MOBILE_MAX_MUTATION_BATCH = 50;

/** `POST /mobile/inventory/mutations` body: mutations applied in array order, each on its own. */
export const MobileMutationsBodySchema = z.object({
  mutations: z.array(MobileMutationSchema).min(1).max(MOBILE_MAX_MUTATION_BATCH),
});

export type MobileMutationsBody = z.infer<typeof MobileMutationsBodySchema>;

const mobileConflictSourceSchema = z.object({ kind: z.string(), label: z.string() });

const mobileFieldConflictShape = {
  kind: z.literal('field'),
  field: z.string(),
  source: mobileConflictSourceSchema,
  at: z.string(),
  currentRevision: z.number().int(),
};

const mobileCodeCollisionSchema = z.object({
  kind: z.literal('code_collision'),
  heldBy: z.object({ id: z.string(), name: z.string() }),
  suggestedCode: z.string().nullable(),
});

const mobileDeletedConflictSchema = z.object({
  kind: z.literal('deleted'),
  source: mobileConflictSourceSchema,
  at: z.string(),
});

const mobileAppliedOutcomeSchema = z.object({
  mutationId: z.string(),
  status: z.literal('applied'),
  revision: z.number().int(),
  seq: z.number().int(),
  converged: z.boolean(),
});

const mobileConflictHeaderSchema = z.object({
  mutationId: z.string(),
  status: z.literal('conflict'),
});

const mobileRejectedOutcomeSchema = z.object({
  mutationId: z.string(),
  status: z.literal('rejected'),
  reason: z.string(),
  message: z.string(),
});

const mobileDeferredOutcomeSchema = z.object({
  mutationId: z.string(),
  status: z.literal('deferred'),
  waitingOn: z.string(),
});

/**
 * One mutation's outcome, mirroring inventory's own `outcomeWireSchema` field
 * for field: `applied`, `conflict` (one of three shapes), `rejected` or
 * `deferred` — one to one with the phone's sync states. A field conflict's
 * `mine`/`theirs` are unconstrained JSON here too, for the same reason the
 * producer leaves them unconstrained on the wire: the recursive JSON schema
 * projects to an OpenAPI component TypeScript rejects.
 */
export const MobileMutationOutcomeSchema = z.union([
  mobileAppliedOutcomeSchema,
  z.intersection(
    mobileConflictHeaderSchema,
    z.discriminatedUnion('kind', [
      z.object({ ...mobileFieldConflictShape, mine: z.unknown(), theirs: z.unknown() }),
      mobileCodeCollisionSchema,
      mobileDeletedConflictSchema,
    ])
  ),
  mobileRejectedOutcomeSchema,
  mobileDeferredOutcomeSchema,
]);

export type MobileMutationOutcome = z.infer<typeof MobileMutationOutcomeSchema>;

/** `POST /mobile/inventory/mutations` response: one outcome per mutation, in request order. */
export const MobileMutationsResponseSchema = z.object({
  outcomes: z.array(MobileMutationOutcomeSchema),
  highWaterSeq: z.number().int(),
});

export type MobileMutationsResponse = z.infer<typeof MobileMutationsResponseSchema>;

/** `POST /mobile/inventory/codes/suggest` body: free codes for a new item. */
export const MobileCodeSuggestBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  typeKey: z.string().min(1).optional(),
  stem: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{0,15}[A-Za-z-]$/)
    .optional(),
});

export type MobileCodeSuggestBody = z.infer<typeof MobileCodeSuggestBodySchema>;

/** `POST /mobile/inventory/codes/suggest` response: a stem followed by the next unused numbers. */
export const MobileCodeSuggestResponseSchema = z.object({
  suggestions: z.array(z.string()),
});

export type MobileCodeSuggestResponse = z.infer<typeof MobileCodeSuggestResponseSchema>;
