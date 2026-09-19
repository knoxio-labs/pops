import { z } from 'zod';

/** Any JSON value: what an event's `before`/`after` and a conflict's `mine`/`theirs` hold. */
export const jsonValueSchema = z.json();
/** A value of {@link jsonValueSchema}. */
export type JsonValue = z.infer<typeof jsonValueSchema>;

/**
 * Who made the change that won a conflict: the winning event's actor kind and
 * a label to show, the device's own label for a phone and "Server" for
 * anything else.
 */
export const conflictSourceSchema = z.object({ kind: z.string(), label: z.string() });
/** A value of {@link conflictSourceSchema}. */
export type ConflictSource = z.infer<typeof conflictSourceSchema>;

const fieldConflictShape = {
  kind: z.literal('field'),
  field: z.string(),
  source: conflictSourceSchema,
  at: z.string(),
  currentRevision: z.number().int(),
};

const fieldConflictSchema = z.object({
  ...fieldConflictShape,
  mine: jsonValueSchema,
  theirs: jsonValueSchema,
});

const codeCollisionSchema = z.object({
  kind: z.literal('code_collision'),
  heldBy: z.object({ id: z.string(), name: z.string() }),
  suggestedCode: z.string().nullable(),
});

const deletedConflictSchema = z.object({
  kind: z.literal('deleted'),
  source: conflictSourceSchema,
  at: z.string(),
});

/** The body of a conflict outcome, without the mutation id and status. */
export const conflictBodySchema = z.discriminatedUnion('kind', [
  fieldConflictSchema,
  codeCollisionSchema,
  deletedConflictSchema,
]);
/** A value of {@link conflictBodySchema}. */
export type ConflictBody = z.infer<typeof conflictBodySchema>;

const appliedSchema = z.object({
  mutationId: z.string(),
  status: z.literal('applied'),
  revision: z.number().int(),
  seq: z.number().int(),
  converged: z.boolean(),
});

const conflictHeaderSchema = z.object({ mutationId: z.string(), status: z.literal('conflict') });

const conflictSchema = z.intersection(conflictHeaderSchema, conflictBodySchema);

const rejectedSchema = z.object({
  mutationId: z.string(),
  status: z.literal('rejected'),
  reason: z.string(),
  message: z.string(),
});

const deferredSchema = z.object({
  mutationId: z.string(),
  status: z.literal('deferred'),
  waitingOn: z.string(),
});

/**
 * An outcome the engine stores in `mutations.outcome` and replays verbatim on
 * a retry. `deferred` is not one: it is never stored.
 */
export const storedOutcomeSchema = z.union([appliedSchema, conflictSchema, rejectedSchema]);
/** A value of {@link storedOutcomeSchema}. */
export type StoredOutcome = z.infer<typeof storedOutcomeSchema>;

/** Every outcome a mutation can have, one to one with the phone's sync states. */
export const outcomeSchema = z.union([storedOutcomeSchema, deferredSchema]);
/** A value of {@link outcomeSchema}. */
export type Outcome = z.infer<typeof outcomeSchema>;

/**
 * {@link outcomeSchema} as the sync contract declares it: identical, except
 * that a field conflict's `mine` and `theirs` are unconstrained rather than
 * the recursive JSON schema. The recursive one projects to an OpenAPI
 * component that openapi-typescript renders as a type referring to itself,
 * which TypeScript rejects; unconstrained is also what a client decodes it as.
 */
export const outcomeWireSchema = z.union([
  appliedSchema,
  z.intersection(
    conflictHeaderSchema,
    z.discriminatedUnion('kind', [
      z.object({ ...fieldConflictShape, mine: z.unknown(), theirs: z.unknown() }),
      codeCollisionSchema,
      deletedConflictSchema,
    ])
  ),
  rejectedSchema,
  deferredSchema,
]);
