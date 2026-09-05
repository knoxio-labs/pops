/**
 * The ledger itself: transactions, the transfer pairs that link two sides of
 * one movement, and the correction rows that rewrite a transaction's entity,
 * type or tags after the fact.
 *
 * One of the groups re-exported by `../index.ts` — see that file's header for
 * why the barrel is split rather than flat.
 */
export * as transactionsService from '../services/transactions.js';

export {
  type CreateTransactionInput,
  type TransactionFilters,
  type TransactionListResult,
  type TransactionRow,
  type UpdateTransactionInput,
} from '../services/transactions.js';

export * as transferPairsService from '../services/transfer-pairs.js';

export type { PairTarget } from '../services/transfer-pairs.js';

export * as transactionCorrectionsService from '../services/transaction-corrections.js';

export {
  type TransactionCorrectionRow,
  type TransactionCorrectionMatchType,
  type TransactionCorrectionTransactionType,
  type CreateTransactionCorrectionInput,
  type UpdateTransactionCorrectionInput,
  type TransactionCorrectionListResult,
  type TransactionCorrectionListQuery,
  type RuleMatchPreviewInput,
  type RuleMatchPreviewResult,
  type RuleMatchPreviewRow,
} from '../services/transaction-corrections.js';
