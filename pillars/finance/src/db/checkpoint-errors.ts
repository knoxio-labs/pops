/**
 * Typed errors raised by the account-checkpoint domain (POPS-2878, ADR-051).
 * Split into their own file rather than added to `errors.ts` or
 * `account-errors.ts`, both already at their line cap; re-exported from
 * `errors.ts` so `from '../errors.js'` keeps working.
 */

/**
 * A delete was attempted against a checkpoint that came from a file rather
 * than from a person. Machine-sourced rows are what an import or a statement
 * said; removing one would only invite the next run of the same import to
 * mint it again, so the row stays and the disagreement is resolved by adding
 * the missing transactions instead.
 */
export class CheckpointSourceNotDeletableError extends Error {
  override readonly name = 'CheckpointSourceNotDeletableError' as const;
  readonly id: string;
  readonly source: string;

  constructor(id: string, source: string) {
    super(`Checkpoint '${id}' came from ${source} and cannot be deleted; only manual rows can`);
    this.id = id;
    this.source = source;
  }
}
