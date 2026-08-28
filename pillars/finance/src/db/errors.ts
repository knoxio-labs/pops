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
