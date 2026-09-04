/**
 * Typed errors raised by the accounts/currencies/institutions/gift-card
 * domain (POPS-2767/2802/2803/2772) — split out of `errors.ts` once that
 * file's single-file line cap made a further split unavoidable. Re-exported
 * from `errors.ts` so existing `from '../errors.js'` imports keep working.
 */

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
 * A transaction write named both an `account` string and an `accountId`
 * (POPS-2769's transition-period dual write), and the two disagree — the id
 * resolves to a different account than the name names. Rejected rather than
 * silently preferring one side, so `account` and `account_id` can never drift
 * apart on a write that supplied both.
 */
export class AccountIdentityMismatchError extends Error {
  override readonly name = 'AccountIdentityMismatchError' as const;
  readonly account: string;
  readonly accountId: string;
  readonly resolvedAccountName: string;

  constructor(account: string, accountId: string, resolvedAccountName: string) {
    super(
      `Account '${account}' does not match accountId '${accountId}' (which resolves to ` +
        `'${resolvedAccountName}')`
    );
    this.account = account;
    this.accountId = accountId;
    this.resolvedAccountName = resolvedAccountName;
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

/**
 * A `person` account was created or updated with no `entityId` and no
 * `allowPendingEntity` escape hatch — a receivable/payable ledger with no
 * contact behind it has nothing to key the balance to (POPS-2771). The one
 * legitimate case where a `person` account briefly has a null `entityId` is
 * the outbox-pending path (`createAccount`'s `allowPendingEntity` option),
 * which this error never fires for.
 */
export class PersonAccountRequiresEntityError extends Error {
  override readonly name = 'PersonAccountRequiresEntityError' as const;

  constructor() {
    super("A 'person' account requires an entityId (or a name to resolve one from)");
  }
}

/**
 * A non-`person` account was created or updated with an `entityId` set.
 * `entityId` exists only to key a `person` account's receivable/payable
 * balance to a contact; every other kind has no such relationship to record.
 */
export class NonPersonAccountHasEntityError extends Error {
  override readonly name = 'NonPersonAccountHasEntityError' as const;
  readonly kind: string;

  constructor(kind: string) {
    super(`Account kind '${kind}' is not 'person' and cannot carry an entityId`);
    this.kind = kind;
  }
}

/**
 * A `person` account's `(entityId, currency)` pair collided with an existing
 * account — `idx_accounts_entity_currency` enforces one `person` account per
 * contact per currency (POPS-2771). Raised both synchronously (a direct
 * create/update naming an already-claimed `entityId`) and by the outbox
 * reconciler (two accounts pending resolution both resolve to the same real
 * contact + currency) — the latter is not retryable, since contacts will
 * resolve the same name to the same id every time.
 */
export class PersonAccountEntityConflictError extends Error {
  override readonly name = 'PersonAccountEntityConflictError' as const;
  readonly entityId: string;
  readonly currency: string;

  constructor(entityId: string, currency: string) {
    super(`A 'person' account for entity '${entityId}' in currency '${currency}' already exists`);
    this.entityId = entityId;
    this.currency = currency;
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
