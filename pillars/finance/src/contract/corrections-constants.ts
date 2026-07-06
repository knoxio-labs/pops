/**
 * Confidence-floor constant shared by both the correction-rule pure helpers
 * (`corrections-pure.ts`) and the REST zod schemas (`rest-corrections-schemas.ts`
 * et al). Split into its own dependency-free module so the schemas can import
 * it without creating a cycle back through `corrections-pure.ts` (which itself
 * imports the `ChangeSet`/`ChangeSetOp` types from the schemas module).
 */

/**
 * Confidence floor below which a correction rule is never eligible to match:
 * every matcher (`findAllMatchingCorrectionFromRules`,
 * `findAllMatchingTransactionCorrectionsFromDb`, the live-import call site)
 * filters out rules with `confidence < MIN_MATCH_CONFIDENCE`. Also the schema
 * default and the create/update validation floor, so a rule can never be
 * persisted below the threshold that would make it structurally inert.
 */
export const MIN_MATCH_CONFIDENCE = 0.7;

/**
 * The canonical transaction-type taxonomy (issue #3607). This is the single
 * source of truth every other declaration derives from — the corrections REST
 * schema (`TransactionTypeSchema`), the imports contract, the drizzle
 * `transaction_type` column enum, and every hand-written union literal that used
 * to be independently kept in sync since #2448.
 *
 * `direction` (debit/credit) is a separate, sign-derived axis and is deliberately
 * NOT part of this type — `type` is a free semantic label that never depends on
 * amount sign. Two axes, per the PRD (`docs/prds/transaction-classification.md`).
 *
 * The first three values (`purchase`/`transfer`/`income`) are the pre-#3607 set
 * and remain a valid subset, so existing correction rows need no migration.
 * Lives here (dependency-free) so both the zod schemas and the db schema can
 * import it without a cycle back through `corrections-pure.ts`.
 */
export const TRANSACTION_TYPES = [
  'purchase',
  'transfer',
  'income',
  'refund',
  'reversal',
  'loan',
  'rebate',
  'tax',
] as const;

/** A transaction's semantic type — one of {@link TRANSACTION_TYPES}. */
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
