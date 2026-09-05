/**
 * Typed errors raised by the finance domain service layer.
 *
 * Plain Error subclasses — the service layer stays HTTP-agnostic. The API
 * layer maps each to its status code when surfacing to clients. The
 * accounts/currencies/institutions/gift-card error family lives in
 * `account-errors.ts`, the account-merge refusal family (POPS-2812) in
 * `merge-account-errors.ts`, the loan family in `loan-errors.ts`, and the
 * account-checkpoint family in `checkpoint-errors.ts` — all split out once
 * this file (then `account-errors.ts`) hit its line cap — and are re-exported
 * here so existing `from '../errors.js'` imports keep working.
 */

export * from './account-errors.js';
export * from './merge-account-errors.js';
export * from './loan-errors.js';
export * from './checkpoint-errors.js';

export class WishListItemNotFoundError extends Error {
  override readonly name = 'WishListItemNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Wish list item '${id}' not found`);
    this.id = id;
  }
}

export class TransactionTagRuleNotFoundError extends Error {
  override readonly name = 'TransactionTagRuleNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Transaction tag rule '${id}' not found`);
    this.id = id;
  }
}

export class TransactionNotFoundError extends Error {
  override readonly name = 'TransactionNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Transaction '${id}' not found`);
    this.id = id;
  }
}

export class TransactionAlreadyExistsError extends Error {
  override readonly name = 'TransactionAlreadyExistsError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Transaction '${id}' already exists`);
    this.id = id;
  }
}

export class ImportTransactionPersistError extends Error {
  override readonly name = 'ImportTransactionPersistError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Import transaction insert succeeded but row not found: ${id}`);
    this.id = id;
  }
}

export class BudgetNotFoundError extends Error {
  override readonly name = 'BudgetNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Budget '${id}' not found`);
    this.id = id;
  }
}

export class BudgetConflictError extends Error {
  override readonly name = 'BudgetConflictError' as const;
  readonly category: string;
  readonly period: string | null;

  constructor(category: string, period: string | null) {
    const periodDesc = period === null ? 'null' : `'${period}'`;
    super(`Budget with category '${category}' and period ${periodDesc} already exists`);
    this.category = category;
    this.period = period;
  }
}

export class TransactionCorrectionNotFoundError extends Error {
  override readonly name = 'TransactionCorrectionNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Transaction correction '${id}' not found`);
    this.id = id;
  }
}

/**
 * A `transaction_corrections` write carried no `entityId`, no
 * `transactionType`, and non-empty `tags` — a tags-only row that violates the
 * classification-rule/tag-rule table boundary (CF061/#3650). Tag-only intent
 * belongs in `transaction_tag_rules`.
 */
export class TagsOnlyCorrectionError extends Error {
  override readonly name = 'TagsOnlyCorrectionError' as const;

  constructor() {
    super(
      'A correction rule needs an entityId or a transactionType — tags-only rules belong in transaction_tag_rules'
    );
  }
}

/**
 * A `regex` rule was written with a pattern that does not compile. Rejected at
 * the write boundary rather than stored: an uncompilable pattern is silently
 * skipped by every matcher, so it would sit in the rule table forever looking
 * active and never firing (POPS-2600).
 */
export class InvalidPatternError extends Error {
  override readonly name = 'InvalidPatternError' as const;
  readonly pattern: string;

  constructor(pattern: string) {
    super(`Pattern is not a valid regular expression: ${pattern}`);
    this.pattern = pattern;
  }
}

/**
 * A tag-rule write whose `exact`/`contains` pattern normalises to the empty
 * string — e.g. `'42'` or `'  '`, since {@link normalizeDescription} strips
 * digits and collapses whitespace. `patternMatchesDescription` special-cases
 * an empty normalised pattern to always return `false`, so a row like this
 * cannot ever fire no matter what the ledger holds tomorrow (POPS-2942).
 *
 * This is deliberately narrower than "matches nothing in the ledger today":
 * that condition is true of any legitimately forward-looking rule written
 * ahead of a new merchant's first transaction, and refusing it would be a
 * worse bug than the one this guards against. An empty normalised pattern has
 * no such legitimate reading — it is unmatchable regardless of what rows
 * exist or ever will — so it is the only case refused at the write boundary.
 * See `pillars/finance/README.md` for the fuller reasoning and POPS-2941 for
 * the ledger-visibility half of this pair.
 */
export class UnmatchablePatternError extends Error {
  override readonly name = 'UnmatchablePatternError' as const;
  readonly pattern: string;

  constructor(pattern: string) {
    super(
      `Pattern normalises to empty and can never match a description: ${JSON.stringify(pattern)}`
    );
    this.pattern = pattern;
  }
}

/**
 * An `account_import_config` row that names a source kind without the field
 * that kind needs to act — a `csv-dialect` with no dialect, an `api` with no
 * provider (POPS-2916). Refused at the write so the imports page never shows
 * an account as configured that nothing can feed.
 */
export class ImportConfigInvalidError extends Error {
  override readonly name = 'ImportConfigInvalidError' as const;
  readonly accountId: string;
  readonly missingField: string;

  constructor(accountId: string, missingField: string) {
    super(`Import config for account ${accountId} needs ${missingField} for its source kind`);
    this.accountId = accountId;
    this.missingField = missingField;
  }
}
