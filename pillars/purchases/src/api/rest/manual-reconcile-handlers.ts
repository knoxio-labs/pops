import { FINANCE_TRANSACTION_URI } from '../../contract/schemas/scalars.js';
import { linkChargeManually } from '../../db/index.js';
import { nowIso } from '../../db/services/internal.js';
import { purchaseErrorBody } from '../errors.js';

import type { z } from 'zod';

import type { ManualTransactionSearchQuerySchema } from '../../contract/rest-reconcile.js';
import type { PurchasesDb } from '../../db/index.js';
import type {
  FinanceTransactionLookup,
  FinanceTransactionSearch,
  CandidateFetch,
} from '../finance/client.js';
import type { CandidateTransaction } from '../finance/wire.js';

type ManualTransactionSearchQuery = z.infer<typeof ManualTransactionSearchQuerySchema>;
type Decision = { chargeId: string; transactionUri: string };

/** Builds the Finance-backed routes that power manually linking unexplained charges. */
export function makeManualReconcileHandlers(
  db: PurchasesDb,
  financeTransactionLookup?: FinanceTransactionLookup,
  financeTransactionSearch?: FinanceTransactionSearch
) {
  return {
    manualCandidates: async ({ query }: { query: ManualTransactionSearchQuery }) => {
      if (financeTransactionSearch === undefined) return financeUnavailable();

      let result: CandidateFetch;
      try {
        result = await financeTransactionSearch.searchTransactions({
          search: query.search,
          limit: query.limit ?? 25,
        });
      } catch {
        return financeUnavailable();
      }
      if (result.kind !== 'ok') return financeUnavailable();

      return {
        status: 200 as const,
        body: { items: result.transactions.map(toManualCandidate) },
      };
    },

    manual: async ({ body }: { body: Decision }) => {
      const transactionId = body.transactionUri.match(FINANCE_TRANSACTION_URI)?.[1];
      if (transactionId === undefined) return missingManualResource(body.transactionUri);
      if (financeTransactionLookup === undefined) return financeUnavailable();

      let result: CandidateFetch;
      try {
        result = await financeTransactionLookup.fetchTransactionsByIds([transactionId]);
      } catch {
        return financeUnavailable();
      }
      if (result.kind !== 'ok') return financeUnavailable();

      const transaction = result.transactions.find((candidate) => candidate.id === transactionId);
      if (transaction === undefined) return missingManualResource(body.transactionUri);

      const outcome = linkChargeManually(db, {
        chargeId: body.chargeId,
        transactionUri: transaction.uri,
        transactionDescription: transaction.description,
        nowIso: nowIso(),
      });
      if (outcome === 'charge_not_found') {
        return missingManualResource(`Unexplained charge ${body.chargeId}`);
      }
      if (outcome === 'already_linked') {
        return {
          status: 409 as const,
          body: purchaseErrorBody('charge_already_linked'),
        };
      }
      return { status: 200 as const, body: { ok: true as const } };
    },
  };
}

function financeUnavailable() {
  return {
    status: 503 as const,
    body: purchaseErrorBody('finance_unavailable'),
  };
}

function missingManualResource(resource: string) {
  return {
    status: 404 as const,
    body: purchaseErrorBody('not_found', {
      message: `${resource} was not found.`,
    }),
  };
}

function toManualCandidate(transaction: CandidateTransaction) {
  return {
    transactionUri: transaction.uri,
    description: transaction.description,
    date: transaction.date,
    payee: transaction.entityName,
    amountCents: transaction.amountCents,
    settlementCurrency: transaction.settlementCurrency,
  };
}
