/**
 * Recognise the `account_checkpoints` machine-source unique violation
 * (POPS-2878, ADR-051), so a caller can treat "this checkpoint is already
 * recorded" as a handled outcome rather than an unhandled exception.
 *
 * That case is the normal one, not an error: re-running the same import over
 * the same file is expected to find its closing balance already stored, and
 * the index on `(account_id, as_of, source) WHERE source != 'manual'` is what
 * stops it doubling.
 *
 * Shape follows the sibling detectors (`budget-unique-violation.ts`,
 * `account-conflict.ts`): better-sqlite3 raises
 * `code = 'SQLITE_CONSTRAINT_UNIQUE'` with a message naming the index, drizzle
 * wraps it as `.cause`, so the chain is walked. The broader
 * `SQLITE_CONSTRAINT` family is accepted as a fallback for a driver that drops
 * the suffix.
 */
const MAX_CAUSE_DEPTH = 5;

export function isCheckpointConflict(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current instanceof Error; depth += 1) {
    if (matchesCheckpointUnique(current)) return true;
    const next: unknown = (current as { cause?: unknown }).cause;
    if (next === current) return false;
    current = next;
  }
  return false;
}

function matchesCheckpointUnique(err: Error): boolean {
  const code: unknown = (err as { code?: unknown }).code;
  if (typeof code !== 'string') return false;
  if (code !== 'SQLITE_CONSTRAINT_UNIQUE' && code !== 'SQLITE_CONSTRAINT') return false;
  return (
    /UNIQUE constraint failed: account_checkpoints/.test(err.message) ||
    /UNIQUE constraint failed: index 'idx_account_checkpoints_/.test(err.message)
  );
}
