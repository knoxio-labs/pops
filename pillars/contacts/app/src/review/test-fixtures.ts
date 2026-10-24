import type { ReadySummary } from './contracts';

/** Fictional readiness used by manual-review tests; production has no missing-data fallback. */
export const noReadyRows: ReadySummary = {
  proposalRevision: 'ready-proof',
  eligibleRows: 0,
  automaticMerges: 0,
  newPeople: 0,
  sourceUpdates: 0,
  sourceRemovals: 0,
  deferred: 0,
  reviewRequired: 1,
  alreadyProcessed: 0,
};
