import type { Candidate } from './useManualCandidateSearch.js';

/** Candidate details shown in the manual-link picker, including persisted review evidence. */
export interface ManualCandidateOption {
  transactionUri: Candidate['transactionUri'];
  description: string | null;
  date: string | null;
  payee: string | null;
  amountCents: number | null;
  settlementCurrency: string | null;
}

/** Merges persisted review candidates with live results while keeping review evidence first. */
export function mergeCandidates(
  reviewCandidates: readonly ManualCandidateOption[],
  searchCandidates: readonly Candidate[]
): ManualCandidateOption[] {
  const merged = new Map(
    reviewCandidates.map((candidate) => [candidate.transactionUri, candidate])
  );
  for (const candidate of searchCandidates) {
    if (!merged.has(candidate.transactionUri)) {
      merged.set(candidate.transactionUri, candidate);
    }
  }
  return [...merged.values()];
}
