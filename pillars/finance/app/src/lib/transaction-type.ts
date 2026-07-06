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

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** Human display labels — the one place a type's UI copy is defined (#3607). */
export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  purchase: 'Expense',
  transfer: 'Transfer',
  income: 'Income',
  refund: 'Refund',
  reversal: 'Reversal',
  loan: 'Loan',
  rebate: 'Rebate',
  tax: 'Tax',
};

export interface TransactionTypeOption {
  value: TransactionType;
  label: string;
}

/** `{ value, label }` options for every type dropdown, derived from the labels. */
export const TRANSACTION_TYPE_OPTIONS: TransactionTypeOption[] = TRANSACTION_TYPES.map((value) => ({
  value,
  label: TRANSACTION_TYPE_LABELS[value],
}));

/** Which dashboard headline tile a transaction type feeds (#3607 stage 2c). */
export type StatTile = 'income' | 'expense' | 'excluded';

/**
 * Explicit type → tile map. Amount sign is NOT used: a positive `refund` is an
 * expense offset, not income; a `tax` credit is income, not a negative expense.
 * `transfer` (an inter-account move) feeds neither tile.
 */
const TILE_BY_TYPE: Record<TransactionType, StatTile> = {
  purchase: 'expense',
  refund: 'expense',
  reversal: 'expense',
  income: 'income',
  loan: 'income',
  rebate: 'income',
  tax: 'income',
  transfer: 'excluded',
};

const TILE_LOOKUP = new Map<string, StatTile>(TRANSACTION_TYPES.map((t) => [t, TILE_BY_TYPE[t]]));
const LABEL_LOOKUP = new Map<string, string>(
  TRANSACTION_TYPES.map((t) => [t, TRANSACTION_TYPE_LABELS[t]])
);

/**
 * The headline tile a (possibly capitalized/legacy) stored type value feeds. An
 * unrecognised value is excluded from both tiles rather than silently summed.
 */
export function tileForType(type: string): StatTile {
  return TILE_LOOKUP.get(type.toLowerCase()) ?? 'excluded';
}

/** Display label for a stored type value, falling back to the raw value. */
export function labelForType(type: string): string {
  return LABEL_LOOKUP.get(type.toLowerCase()) ?? type;
}
