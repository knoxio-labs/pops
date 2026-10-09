import type { ChargeForReview, SolvableTransaction } from './types.js';

/** Builds a review result with the transactions a human can consider. */
export function reviewOutcome(
  reason: ChargeForReview['reason'],
  candidates: readonly { readonly transaction: SolvableTransaction }[]
): { kind: 'review'; reason: ChargeForReview['reason']; candidateUris: readonly string[] } {
  return {
    kind: 'review',
    reason,
    candidateUris: candidates.map(({ transaction }) => transaction.uri),
  };
}
