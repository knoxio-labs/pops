/**
 * Typed errors raised by the finance domain service layer.
 *
 * Plain Error subclasses — the service layer stays HTTP-agnostic. The API
 * layer maps each to its status code when surfacing to clients.
 */

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

export class CurrencyNotFoundError extends Error {
  override readonly name = 'CurrencyNotFoundError' as const;
  readonly code: string;

  constructor(code: string) {
    super(`Currency '${code}' not found`);
    this.code = code;
  }
}

export class CurrencyConflictError extends Error {
  override readonly name = 'CurrencyConflictError' as const;
  readonly code: string;

  constructor(code: string) {
    super(`Currency '${code}' already exists`);
    this.code = code;
  }
}

/**
 * A currency cannot be deleted because some other table's `currency` FK
 * references it — `accounts.currency` (POPS-2767) is the first such table.
 * `currenciesService.isCurrencyInUse` scans for it generically, so this stays
 * accurate as further tables gain a `currency` column.
 */
export class CurrencyInUseError extends Error {
  override readonly name = 'CurrencyInUseError' as const;
  readonly code: string;

  constructor(code: string) {
    super(`Currency '${code}' is in use and cannot be deleted`);
    this.code = code;
  }
}

export class InstitutionNotFoundError extends Error {
  override readonly name = 'InstitutionNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Institution '${id}' not found`);
    this.id = id;
  }
}

export class InstitutionConflictError extends Error {
  override readonly name = 'InstitutionConflictError' as const;
  readonly institutionName: string;

  constructor(institutionName: string) {
    super(`Institution '${institutionName}' already exists`);
    this.institutionName = institutionName;
  }
}

/**
 * An institution cannot be deleted because some other table's
 * `institution_id` FK references it — `accounts.institution_id` (POPS-2767)
 * is the first such table. `institutionsService.isInstitutionInUse` scans for
 * it generically, so this stays accurate as further tables gain an
 * `institution_id` column.
 */
export class InstitutionInUseError extends Error {
  override readonly name = 'InstitutionInUseError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Institution '${id}' is in use and cannot be deleted`);
    this.id = id;
  }
}

export class AccountNotFoundError extends Error {
  override readonly name = 'AccountNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Account '${id}' not found`);
    this.id = id;
  }
}

export class AccountNameConflictError extends Error {
  override readonly name = 'AccountNameConflictError' as const;
  readonly accountName: string;

  constructor(accountName: string) {
    super(`Account '${accountName}' already exists`);
    this.accountName = accountName;
  }
}

/**
 * An account was created with a kind not in `DAY_ONE_ACCOUNT_KINDS` — the
 * kind exists in `ACCOUNT_KINDS` (so it type-checks and can be stored on
 * rows written some other way) but has no ledger behaviour defined yet
 * (see `ACCOUNT_KIND_BEHAVIOURS`'s `RESERVED_PLACEHOLDER` entries), so
 * accepting it as a create input would silently produce an account nothing
 * can act on correctly.
 */
export class ReservedAccountKindError extends Error {
  override readonly name = 'ReservedAccountKindError' as const;
  readonly kind: string;

  constructor(kind: string) {
    super(`Account kind '${kind}' is reserved and has no behaviour defined yet`);
    this.kind = kind;
  }
}

/**
 * A second `cash` account was created (or updated into) a currency that
 * already has one — `idx_accounts_kind_currency_cash` scopes uniqueness to
 * `kind = 'cash'` because two cash accounts in the same currency are
 * indistinguishable (both are just "the currency's physical cash"), unlike
 * two `credit-card` accounts, which are legitimately different cards.
 */
export class AccountCashCurrencyConflictError extends Error {
  override readonly name = 'AccountCashCurrencyConflictError' as const;
  readonly currency: string;

  constructor(currency: string) {
    super(`A cash account in currency '${currency}' already exists`);
    this.currency = currency;
  }
}

/**
 * A transaction write named an `account` string (POPS-2767's free-text
 * column, kept for one more ticket) that matches no `accounts.name` — the
 * same fail-loud rule `0083_accounts.sql`'s backfill enforces for historical
 * rows, applied to new writes so `account` and `account_id` never drift
 * apart. Not a member of the `Account*` family above (those are keyed by id,
 * not by the free-text name a caller supplied) because the caller here never
 * named an account id at all.
 */
export class UnresolvedAccountNameError extends Error {
  override readonly name = 'UnresolvedAccountNameError' as const;
  readonly accountName: string;

  constructor(accountName: string) {
    super(`No account named '${accountName}' — create it before writing a transaction against it`);
    this.accountName = accountName;
  }
}

/**
 * A gift-card-only write (or read) targeted an account whose current `kind`
 * is not `gift-card`. Checked at the service layer against the account's
 * live `kind` rather than a SQL constraint, because `accounts.kind` can
 * change after gift-card details were written (nothing stops a subsequent
 * `PATCH /accounts/:id` from retyping it) and SQLite can't express "this
 * FK's target row must have `kind = X`".
 */
export class AccountKindMismatchError extends Error {
  override readonly name = 'AccountKindMismatchError' as const;
  readonly id: string;
  readonly actualKind: string;
  readonly expectedKind: string;

  constructor(id: string, actualKind: string, expectedKind: string) {
    super(`Account '${id}' is kind '${actualKind}', not '${expectedKind}'`);
    this.id = id;
    this.actualKind = actualKind;
    this.expectedKind = expectedKind;
  }
}

export class GiftCardDetailsNotFoundError extends Error {
  override readonly name = 'GiftCardDetailsNotFoundError' as const;
  readonly accountId: string;

  constructor(accountId: string) {
    super(`Gift card details for account '${accountId}' not found`);
    this.accountId = accountId;
  }
}

/**
 * A gift-card secret write or reveal was attempted with no encryption key
 * configured. Thrown rather than falling back to storing/returning the
 * secret unencrypted — see `services/gift-card-crypto.ts`.
 */
export class GiftCardEncryptionKeyMissingError extends Error {
  override readonly name = 'GiftCardEncryptionKeyMissingError' as const;

  constructor() {
    super(
      'No gift card encryption key configured — set FINANCE_GIFT_CARD_ENCRYPTION_KEY_FILE ' +
        '(production) or FINANCE_GIFT_CARD_ENCRYPTION_KEY (local dev) before writing or ' +
        'revealing a gift card secret'
    );
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
