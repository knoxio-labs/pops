import { FINANCE_TRANSACTION_URI } from '../../contract/schemas/scalars.js';

import type { CandidateTransaction } from '../finance/wire.js';

/** Finance details attached to a persisted reconciliation review candidate. */
export interface WireReviewCandidate {
  transactionUri: string;
  description: string | null;
  date: string | null;
  payee: string | null;
  amountCents: number | null;
  settlementCurrency: string | null;
}

function transactionDetails(
  transactionUri: string,
  transactionsById: ReadonlyMap<string, CandidateTransaction>
): CandidateTransaction | undefined {
  const id = transactionUri.match(FINANCE_TRANSACTION_URI)?.[1];
  return id === undefined ? undefined : transactionsById.get(id);
}

/** Adds Finance details to a review candidate when the lookup has them. */
export function toWireReviewCandidate(
  transactionUri: string,
  transactionsById: ReadonlyMap<string, CandidateTransaction>
): WireReviewCandidate {
  const transaction = transactionDetails(transactionUri, transactionsById);
  return {
    transactionUri,
    description: transaction?.description ?? null,
    date: transaction?.date ?? null,
    payee: transaction?.entityName ?? null,
    amountCents: transaction?.amountCents ?? null,
    settlementCurrency: transaction?.settlementCurrency ?? null,
  };
}
