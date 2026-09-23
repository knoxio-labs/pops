import type { ConflictBody } from './outcome.js';

/**
 * Why the server refuses a mutation outright. Closed on the server; the wire
 * carries it as an open string so a new reason cannot break an installed app.
 */
export const REJECTION_REASONS = [
  'invalid',
  'type_unknown',
  'catalogue_changed',
  'cycle',
  'target_missing',
  'reference_type_mismatch',
  'not_container',
  'has_contents',
  'illegal_transition',
  'media_missing',
] as const;
/** One of {@link REJECTION_REASONS}. */
export type RejectionReason = (typeof REJECTION_REASONS)[number];

/**
 * Thrown by an op (or the engine) to refuse a mutation. The engine rolls back
 * everything the op wrote, stores a `rejected` outcome, and never retries it.
 */
export class CommandRejected extends Error {
  override readonly name = 'CommandRejected' as const;
  readonly reason: RejectionReason;

  constructor(reason: RejectionReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

/**
 * Thrown by an op that detects a conflict of its own, rather than one the
 * engine's revision check finds (`event.revert` against a later change, a code
 * already held). The engine rolls back the op's writes and stores `conflict`.
 */
export class CommandConflict extends Error {
  override readonly name = 'CommandConflict' as const;
  readonly conflict: ConflictBody;

  constructor(conflict: ConflictBody) {
    super(`conflict: ${conflict.kind}`);
    this.conflict = conflict;
  }
}
