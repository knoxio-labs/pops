/**
 * better-sqlite3 surfaces a UNIQUE index violation with
 * `code = 'SQLITE_CONSTRAINT_UNIQUE'` and a message naming the index.
 * Drizzle wraps these in a `DrizzleError` carrying the original as `.cause`,
 * so we walk the cause chain. See `institution-conflict.ts` for the same
 * pattern against `institutions`.
 *
 * `accounts` carries two independent UNIQUE indexes, so two distinct
 * matchers: `idx_accounts_name_nocase` (a duplicate account name) and the
 * partial `idx_accounts_kind_currency_cash` (a second `cash` account in a
 * currency that already has one).
 */
const MAX_CAUSE_DEPTH = 5;

function walkCauses(err: unknown, matches: (err: Error) => boolean): boolean {
  let current: unknown = err;
  for (let i = 0; i < MAX_CAUSE_DEPTH && current instanceof Error; i++) {
    if (matches(current)) return true;
    const next: unknown = (current as { cause?: unknown }).cause;
    if (next === current) return false;
    current = next;
  }
  return false;
}

function isConstraintError(err: Error): boolean {
  const code: unknown = (err as { code?: unknown }).code;
  return (
    typeof code === 'string' &&
    (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT')
  );
}

export function isAccountNameConflict(err: unknown): boolean {
  return walkCauses(
    err,
    (current) =>
      isConstraintError(current) &&
      (/UNIQUE constraint failed: accounts\.name/.test(current.message) ||
        /UNIQUE constraint failed: index 'idx_accounts_name_nocase'/.test(current.message))
  );
}

export function isAccountCashCurrencyConflict(err: unknown): boolean {
  return walkCauses(
    err,
    (current) =>
      isConstraintError(current) &&
      (/UNIQUE constraint failed: index 'idx_accounts_kind_currency_cash'/.test(current.message) ||
        /UNIQUE constraint failed: accounts\.kind, accounts\.currency/.test(current.message))
  );
}
