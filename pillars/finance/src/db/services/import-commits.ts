/**
 * Import-commit idempotency log (issues #3640/#3642).
 *
 * `commitImport` accepts an optional client-generated `commitKey` scoped to
 * a single "Approve & Commit All" click. The first call with a given key
 * runs the commit and records its result here, keyed on `commitKey`; every
 * subsequent call with the same key — a resubmitted request after a client
 * timeout, or a genuine double-click that raced past the in-flight guard —
 * is a pure replay of the recorded result instead of a second application
 * of every ChangeSet/transaction in the payload.
 *
 * `commitKey` is the table's primary key, so a race between two calls that
 * both pass the pre-flight "not yet committed" check is resolved by SQLite
 * itself: the loser's `record` raises `SQLITE_CONSTRAINT_UNIQUE`, which
 * `commit.ts` catches and turns into the same replay path.
 *
 * This service deliberately stores/returns the recorded result as opaque
 * JSON (`unknown`) rather than importing `CommitResultSchema` from the
 * contract layer: the contract already imports table constants from this
 * package's `db/index.ts` barrel (`ENTITY_TYPES`/`TRANSACTION_MATCH_TYPES`),
 * so a contract import here would close an import cycle. `commit.ts` (the
 * api layer, which already depends on the contract) re-validates the JSON
 * with `CommitResultSchema.parse` before handing it back to a caller.
 */
import { eq } from 'drizzle-orm';

import { importCommits } from '../schema.js';

import type { FinanceDb } from './internal.js';

const MAX_CAUSE_DEPTH = 5;

/**
 * True if `err` is a `SQLITE_CONSTRAINT_UNIQUE` violation on `import_commits`
 * (or its primary key index) — the race-loser case described above.
 * Drizzle wraps the raw better-sqlite3 error in a `DrizzleError` carrying
 * the original as `.cause`, so the cause chain is walked defensively.
 */
export function isImportCommitUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let i = 0; i < MAX_CAUSE_DEPTH && current instanceof Error; i++) {
    if (matchesImportCommitsUnique(current)) return true;
    const next: unknown = (current as { cause?: unknown }).cause;
    if (next === current) return false;
    current = next;
  }
  return false;
}

function matchesImportCommitsUnique(err: Error): boolean {
  const code: unknown = (err as { code?: unknown }).code;
  if (typeof code !== 'string') return false;
  if (code !== 'SQLITE_CONSTRAINT_UNIQUE' && code !== 'SQLITE_CONSTRAINT') return false;
  return (
    /UNIQUE constraint failed: import_commits/.test(err.message) ||
    /UNIQUE constraint failed: index 'idx_import_commits_/.test(err.message)
  );
}

/**
 * The recorded result for `commitKey` as opaque JSON, or `undefined` if this
 * key has never been committed. Callers validate the shape themselves (see
 * the module doc) — this layer has no contract dependency to validate with.
 */
export function findCommittedResultJson(db: FinanceDb, commitKey: string): unknown {
  const row = db.select().from(importCommits).where(eq(importCommits.commitKey, commitKey)).get();
  return row ? JSON.parse(row.result) : undefined;
}

/**
 * Record `result` under `commitKey`. Throws (uncaught) on a duplicate key —
 * callers running inside the commit's own `db.transaction` rely on that to
 * roll the rest of the commit back when a race loses to a concurrent commit
 * of the same key; see {@link isImportCommitUniqueViolation}.
 */
export function recordCommit(db: FinanceDb, commitKey: string, result: unknown): void {
  db.insert(importCommits)
    .values({ commitKey, result: JSON.stringify(result) })
    .run();
}
