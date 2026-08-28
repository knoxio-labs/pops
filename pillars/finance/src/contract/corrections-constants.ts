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
 * `findAllMatchingTransactionCorrectionsFromDb`,
 * `findAllMatchingTransactionCorrections`, the live-import call site)
 * filters out rules with `confidence < MIN_MATCH_CONFIDENCE` — when
 * classifying a transaction and equally when contributing its tags. Also the schema
 * default and the create/update validation floor, so a rule can never be
 * persisted below the threshold that would make it structurally inert.
 */
export const MIN_MATCH_CONFIDENCE = 0.7;

/**
 * The canonical transaction-type taxonomy. This is the single source of truth
 * every other declaration derives from — the corrections REST schema
 * (`TransactionTypeSchema`), the imports contract, the drizzle
 * `transaction_type` column enum, and every hand-written union literal that
 * used to be independently kept in sync.
 *
 * Classification is two independent axes, and only one of them lives here.
 * `direction` (debit/credit) is derived from the amount's sign; `type` is a
 * free semantic label that never depends on it, which is why the two cannot be
 * collapsed into a single enum.
 *
 * The first three values (`purchase`/`transfer`/`income`) are the original set
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
  'fee',
] as const;

/** A transaction's semantic type — one of {@link TRANSACTION_TYPES}. */
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/**
 * Which headline bucket a type feeds — the one place "is this spend" is
 * answered (POPS-2610).
 *
 * Amount sign is deliberately not consulted: a positive `refund` is an expense
 * offset, not income, and a `tax` credit is income, not negative spend. A
 * `transfer` — an inter-account move, a gift card bought, a card payment
 * received — is excluded from both, because the same dollars are already
 * counted where they were actually spent.
 *
 * `fee` is spend: interest and late charges are money genuinely leaving. What
 * the type buys is separability — a fee no longer sits in the same namespace as
 * the things you bought, so a category total can exclude it and a fee report can
 * find it without depending on anyone having tagged the row.
 */
export const TRANSACTION_TYPE_STAT_TILE = {
  purchase: 'expense',
  refund: 'expense',
  reversal: 'expense',
  fee: 'expense',
  income: 'income',
  loan: 'income',
  rebate: 'income',
  tax: 'income',
  transfer: 'excluded',
} as const satisfies Record<TransactionType, 'income' | 'expense' | 'excluded'>;

/**
 * The types that count as spend — what "what did I spend on X" sums. Every
 * spend aggregation filters on this set rather than on the absence of a tag: a
 * tag nobody applied excluded nothing (POPS-2610).
 *
 * Deliberately NOT the expense tile. A `fee` is money that left the account —
 * so it belongs on the expense headline — but it was not spent ON anything:
 * interest and late charges are a cost of the account, not of a category, and
 * counting them as spend is the distortion this split exists to remove. They
 * are aggregated on their own, by `type = 'fee'`, with the `fee:` namespace
 * saying which kind.
 */
export const SPEND_TRANSACTION_TYPES = [
  'purchase',
  'refund',
  'reversal',
] as const satisfies readonly TransactionType[];

const SPEND_TYPE_LOOKUP = new Set<string>(SPEND_TRANSACTION_TYPES);

/** Whether a stored `type` value counts as outgoing spend. */
export function isSpendType(type: string): boolean {
  return SPEND_TYPE_LOOKUP.has(type.toLowerCase());
}
