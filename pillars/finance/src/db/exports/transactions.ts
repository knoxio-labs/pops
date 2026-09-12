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

export { financeSummary } from '../services/summary.js';

export type { FinanceSummary, SummaryInference, SummaryOptions } from '../services/summary.js';

export type { AccountSpend, MonthSpend } from '../services/summary-breakdowns.js';

export type { EntitySpend, TagSpend } from '../services/summary-facets.js';

export type { SpendMeasure, SummaryRange } from '../services/summary-sql.js';

export {
  monthsInRange,
  resolveSummaryWindow,
  type DateRange,
  type ResolvedSummaryWindow,
} from '../services/summary-window.js';

export {
  CONCENTRATION_ENTITY_COUNT,
  SUBSCRIPTION_TAG,
  type Concentration,
  type ForeignSpend,
  type LargestCharge,
  type RecurringSubscriptions,
} from '../services/summary-inference.js';

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
