import type { CatalogueChange } from './catalogue-change.js';
import type { ConflictBody } from './outcome.js';

/**
 * Why the server refuses a mutation outright. Closed on the server; the wire
 * carries it as an open string so a new reason cannot break an installed app.
 */
export const REJECTION_REASONS = [
  'invalid',
  'type_unknown',
  'catalogue_changed',
  'catalogue_update_required',
  'catalogue_repair_required',
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
 * `catalogueChanges` says which definitions a `catalogue_update_required` or
 * `catalogue_repair_required` refusal is about; the outcome carries it only
 * when it is non-empty.
 */
export class CommandRejected extends Error {
  override readonly name = 'CommandRejected' as const;
  readonly reason: RejectionReason;
  readonly catalogueChanges: readonly CatalogueChange[];

  constructor(
    reason: RejectionReason,
    message: string,
    catalogueChanges: readonly CatalogueChange[] = []
  ) {
    super(message);
    this.reason = reason;
    this.catalogueChanges = catalogueChanges;
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
