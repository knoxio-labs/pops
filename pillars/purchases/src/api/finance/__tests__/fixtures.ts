/**
 * The fake finance client every reconciliation test drives.
 *
 * Shared rather than re-declared per file because a partial fake is worse
 * than none here: the sweep, the REST surface and the contract-conformance
 * suite all feed the solver through this seam, and a fixture missing half
 * of {@link CandidateTransaction} lets those tests agree on a shape that
 * finance never actually sends.
 */
import { financeTransactionUri, type CandidateTransaction } from '../wire.js';

import type { CandidateFetch, FinanceClient } from '../client.js';

/**
 * Everything a test may vary about a candidate.
 *
 * `id` is required and `uri` cannot be stated at all: the URI is derived
 * from the id exactly as `toCandidateTransaction` derives it in production,
 * so a fixture cannot claim an id and a URI that disagree.
 */
export type CandidateOverrides = Partial<Omit<CandidateTransaction, 'id' | 'uri'>> &
  Pick<CandidateTransaction, 'id'>;

function aCandidateTransaction(overrides: CandidateOverrides): CandidateTransaction {
  return {
    description: 'AMAZON MKTPLACE AU',
    account: 'everyday',
    amountCents: 4128,
    date: '2026-03-06',
    type: 'purchase',
    entityId: null,
    entityName: null,
    ...overrides,
    uri: financeTransactionUri(overrides.id),
  };
}

/** A finance client whose window holds exactly the given candidates. */
export function financeReturning(...candidates: readonly CandidateOverrides[]): FinanceClient {
  const transactions = candidates.map((candidate) => aCandidateTransaction(candidate));
  return {
    fetchCandidates: () => Promise.resolve<CandidateFetch>({ kind: 'ok', transactions }),
  };
}

/**
 * A finance client that cannot be read at all — the case a sweep must
 * distinguish from an empty window, or it unlinks correctly matched orders.
 */
export const FINANCE_UNAVAILABLE: FinanceClient = {
  fetchCandidates: () =>
    Promise.resolve<CandidateFetch>({ kind: 'unavailable', reason: 'unavailable' }),
};
