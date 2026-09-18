/**
 * The command layer: revisioned, event-logged, conflict-checked writes to
 * items and locations. Internal to the pillar; callers go through
 * {@link runMutation} or {@link runMutations}.
 */
export { runMutation, runMutations, type EngineOptions } from './engine.js';
export {
  actorColumns,
  actorKey,
  mutationSchema,
  type ActorColumns,
  type CommandActor,
  type Mutation,
} from './envelope.js';
export {
  CommandConflict,
  CommandRejected,
  REJECTION_REASONS,
  type RejectionReason,
} from './errors.js';
export {
  outcomeSchema,
  storedOutcomeSchema,
  type ConflictBody,
  type ConflictSource,
  type JsonValue,
  type Outcome,
  type StoredOutcome,
} from './outcome.js';
export { placementSchema, type Placement, type PreviousPlacement } from './item-fields.js';
export { MAX_CONTAINMENT_DEPTH } from './placement.js';
export { buildRegistry, COMMAND_REGISTRY, type OpRegistry } from './registry.js';
export { defineOp, type RegisteredOp } from './op.js';
export type { CommandDb, EntityKind, LoadedEntity } from './entities.js';
