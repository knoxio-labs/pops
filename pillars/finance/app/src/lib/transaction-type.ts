/**
 * Canonical transaction-type taxonomy on the frontend, mirroring the finance
 * pillar's `TRANSACTION_TYPES` (#3607).
 *
 * The generated Hey API client inlines this union per-operation rather than
 * exporting a single named type, so this is the FE's one hand-maintained
 * declaration — every hand-written literal derives from it instead of
 * re-listing the eight values (which is exactly the drift the backend
 * consolidation removed). Keep in lockstep with
 * `pillars/finance/src/contract/corrections-constants.ts`.
 */
export type TransactionType =
  | 'purchase'
  | 'transfer'
  | 'income'
  | 'refund'
  | 'reversal'
  | 'loan'
  | 'rebate'
  | 'tax';
