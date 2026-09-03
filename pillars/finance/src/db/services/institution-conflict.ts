/**
 * better-sqlite3 surfaces a UNIQUE index violation with
 * `code = 'SQLITE_CONSTRAINT_UNIQUE'` and a message naming the index.
 * Drizzle wraps these in a `DrizzleError` carrying the original as `.cause`,
 * so we walk the cause chain. See `budget-unique-violation.ts` for the same
 * pattern against `budgets`' unique index.
 */
const MAX_CAUSE_DEPTH = 5;

export function isInstitutionNameConflict(err: unknown): boolean {
  let current: unknown = err;
  for (let i = 0; i < MAX_CAUSE_DEPTH && current instanceof Error; i++) {
    if (matchesInstitutionsNameUnique(current)) return true;
    const next: unknown = (current as { cause?: unknown }).cause;
    if (next === current) return false;
    current = next;
  }
  return false;
}

function matchesInstitutionsNameUnique(err: Error): boolean {
  const code: unknown = (err as { code?: unknown }).code;
  if (typeof code !== 'string') return false;
  if (code !== 'SQLITE_CONSTRAINT_UNIQUE' && code !== 'SQLITE_CONSTRAINT') return false;
  return (
    /UNIQUE constraint failed: institutions\.name/.test(err.message) ||
    /UNIQUE constraint failed: index 'idx_institutions_name_nocase'/.test(err.message)
  );
}
