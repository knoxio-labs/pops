import { MAX_RECEIPT_PARTS } from './parts';

import type { StagedPart, StagingProblem } from '@/fixtures/purchases-receipt-intake';

/**
 * A receipt as staged in the browser before submission: the parts that made
 * it in, and what happened to the ones from the last batch that did not.
 */
export interface Staging {
  readonly parts: StagedPart[];
  readonly problems: StagingProblem[];
}

/** The drop zone's staging before anything has been chosen. */
export const EMPTY_STAGING: Staging = { parts: [], problems: [] };

/** One batch of chosen files, classified before it is folded into the staged receipt. */
export interface StagedBatch {
  readonly staged: StagedPart[];
  /** Files whose media type the upload does not accept. */
  readonly rejected: string[];
}

/**
 * Fold one batch into the staged receipt, keeping the order the files were
 * chosen in and stopping at the contract's bound.
 *
 * The problems replace the previous ones rather than accumulating: they
 * describe the batch just added, and a complaint about a file the user has
 * since dealt with is noise.
 */
export function stage(current: Staging, batch: StagedBatch): Staging {
  const room = Math.max(0, MAX_RECEIPT_PARTS - current.parts.length);
  const fitting = batch.staged.slice(0, room);
  const dropped = batch.staged.length - fitting.length;

  const problems: StagingProblem[] = [];
  if (batch.rejected.length > 0) problems.push({ kind: 'rejected', names: batch.rejected });
  if (dropped > 0) problems.push({ kind: 'tooMany', dropped });

  return { parts: [...current.parts, ...fitting], problems };
}

/**
 * Fold files refused before they ever reached {@link stage} — the drop zone
 * applies the same accept filter itself, so a dragged-in `.heic` is turned
 * away there — into the current problems.
 *
 * They merge into the batch's own rejection rather than sitting beside it: one
 * gesture that mixes both produces one list of names for the reader, and two
 * separate complaints would read as two separate mistakes.
 */
export function withRefused(current: Staging, names: readonly string[]): Staging {
  if (names.length === 0) return current;
  const rejected = current.problems.filter((problem) => problem.kind === 'rejected');
  const merged: StagingProblem = {
    kind: 'rejected',
    names: [...rejected.flatMap((problem) => problem.names), ...names],
  };
  return {
    parts: current.parts,
    problems: [merged, ...current.problems.filter((problem) => problem.kind !== 'rejected')],
  };
}
