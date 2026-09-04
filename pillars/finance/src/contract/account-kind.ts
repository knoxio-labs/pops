/**
 * What an `accounts` row is (POPS-2767).
 *
 * `kind` is a discriminator only — it does not itself carry behaviour. The
 * three ledger behaviours a kind implies (sign convention, whether it has an
 * external balance to checkpoint against, whether it is stored value) live in
 * {@link ACCOUNT_KIND_BEHAVIOURS} / {@link getAccountKindBehaviour}, keyed off
 * this enum, so a new kind cannot be added without deciding all three.
 */
export const ACCOUNT_KINDS = [
  /** An everyday transaction account held at a bank. */
  'checking',
  /** An interest-bearing deposit account held at a bank. */
  'savings',
  /** A revolving-credit card account — spending increases what is owed. */
  'credit-card',
  /** Physical cash, tracked as a ledger balance with no issuing institution. */
  'cash',
  /** A prepaid gift card or voucher — spending draws down a fixed stored value. */
  'gift-card',
  /**
   * A running IOU with another person — not a bank product. Balance sign
   * says who owes whom (see {@link ACCOUNT_KIND_BEHAVIOURS}).
   */
  'person',
  /** Reserved: a joint/shared account. No behaviour defined yet. */
  'shared',
  /**
   * A personal loan or mortgage — a debt owed to a lender, drawn down by
   * repayments. Its terms, rate history and offset links live in the
   * `loan_terms` / `loan_rate_history` / `loan_offset_links` tables
   * (POPS-2829).
   */
  'loan',
  /** Reserved: a novated lease. No behaviour defined yet. */
  'novated-lease',
  /** Reserved: a cryptocurrency wallet/exchange balance. No behaviour defined yet. */
  'crypto',
  /** Reserved: anything not yet named by a more specific kind. */
  'other',
] as const;

/** One member of {@link ACCOUNT_KINDS}. */
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

/** Day-one kinds — the ones {@link ACCOUNT_KIND_BEHAVIOURS} derives real behaviour for. */
export const DAY_ONE_ACCOUNT_KINDS = [
  'checking',
  'savings',
  'credit-card',
  'cash',
  'gift-card',
  'person',
  'loan',
] as const satisfies readonly AccountKind[];

/**
 * The three ledger behaviours a kind implies. `kind` is a discriminator
 * only — every place that needs to act differently per kind should branch on
 * one of these fields, not on `kind` itself, so a new kind slots in by
 * filling this table rather than by hunting down every `if (kind === ...)`.
 */
export interface AccountKindBehaviour {
  /**
   * Whether a positive balance reads as money the ledger holds (`'asset'`)
   * or money it owes (`'liability'`).
   */
  signConvention: 'asset' | 'liability';
  /**
   * Whether there is a real-world statement/balance to checkpoint against
   * (POPS-2750 territory) — the thing a reconciliation flow would compare
   * the ledger to.
   */
  hasExternalBalance: boolean;
  /** Whether the balance itself IS the value held, rather than a claim on money elsewhere. */
  isStoredValue: boolean;
}

/** Safe placeholder for a reserved kind with no behaviour decided yet. */
const RESERVED_PLACEHOLDER: AccountKindBehaviour = {
  signConvention: 'asset',
  hasExternalBalance: false,
  isStoredValue: false,
};

/**
 * Ledger behaviour per {@link AccountKind}, `satisfies Record<AccountKind, …>`
 * so adding a member to {@link ACCOUNT_KINDS} without adding an entry here is
 * a compile error.
 */
export const ACCOUNT_KIND_BEHAVIOURS = {
  checking: { signConvention: 'asset', hasExternalBalance: true, isStoredValue: false },
  savings: { signConvention: 'asset', hasExternalBalance: true, isStoredValue: false },
  'credit-card': { signConvention: 'liability', hasExternalBalance: true, isStoredValue: false },
  // No external statement — it's literally cash.
  cash: { signConvention: 'asset', hasExternalBalance: false, isStoredValue: false },
  // Judgement call: a gift card is "checking-like plus expiry/number/PIN" for
  // FIELDS, but there is no reliable external balance source for it the way a
  // bank statement is for checking/savings/credit-card, so it is modelled as
  // having no external balance despite otherwise resembling those kinds.
  'gift-card': { signConvention: 'asset', hasExternalBalance: false, isStoredValue: true },
  // A positive balance means they owe the ledger owner (a receivable), which
  // reads like an asset — the epic's decision log: "sign of the balance says
  // who owes whom". Internal ledger, no external institution to checkpoint
  // against.
  person: { signConvention: 'asset', hasExternalBalance: false, isStoredValue: false },
  shared: RESERVED_PLACEHOLDER,
  // A liability: a positive balance is what is still owed to the lender. The
  // lender issues statements, so there IS an external balance to checkpoint
  // against (POPS-2750's territory). Not stored value — the balance is a debt,
  // not money the ledger holds.
  loan: { signConvention: 'liability', hasExternalBalance: true, isStoredValue: false },
  'novated-lease': RESERVED_PLACEHOLDER,
  crypto: RESERVED_PLACEHOLDER,
  other: RESERVED_PLACEHOLDER,
} as const satisfies Record<AccountKind, AccountKindBehaviour>;

/** Look up the ledger behaviour for one {@link AccountKind}. */
export function getAccountKindBehaviour(kind: AccountKind): AccountKindBehaviour {
  return ACCOUNT_KIND_BEHAVIOURS[kind];
}
