/**
 * better-sqlite3 surfaces a text PRIMARY KEY violation with
 * `code = 'SQLITE_CONSTRAINT_PRIMARYKEY'` (SQLite treats a non-INTEGER
 * PRIMARY KEY as an implicit UNIQUE index). Drizzle wraps these in a
 * `DrizzleError` carrying the original as `.cause`, so we walk the cause
 * chain. See `budget-unique-violation.ts` for the same pattern against
 * `budgets`' explicit unique index.
 */
const MAX_CAUSE_DEPTH = 5;

export function isCurrencyCodeConflict(err: unknown): boolean {
  let current: unknown = err;
  for (let i = 0; i < MAX_CAUSE_DEPTH && current instanceof Error; i++) {
    if (matchesCurrenciesPrimaryKey(current)) return true;
    const next: unknown = (current as { cause?: unknown }).cause;
    if (next === current) return false;
    current = next;
  }
  return false;
}

function matchesCurrenciesPrimaryKey(err: Error): boolean {
  const code: unknown = (err as { code?: unknown }).code;
  if (typeof code !== 'string') return false;
  if (code !== 'SQLITE_CONSTRAINT_PRIMARYKEY' && code !== 'SQLITE_CONSTRAINT') return false;
  return /UNIQUE constraint failed: currencies\.code/.test(err.message);
}
