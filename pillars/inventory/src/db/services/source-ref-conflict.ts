/**
 * Recognise the `home_inventory.source_ref` unique violation (POPS-2433).
 *
 * Two concurrent creates naming the same external slot both pass whatever
 * in-process check their caller runs and race to the insert; the loser's
 * write raises `SQLITE_CONSTRAINT_UNIQUE` on `idx_inventory_source_ref`,
 * which `createInventoryItem` uses to fetch and return the winner's row
 * instead of minting a second one.
 *
 * Message-matched against the index name, not just the code: `home_inventory`
 * carries two other unique indexes (`asset_id`, `notion_id`) that must NOT be
 * swallowed here — a genuine asset-id collision should still surface as an
 * error rather than being misread as an idempotent replay.
 *
 * Shape follows the sibling detectors in `pillars/finance/src/db/services/`
 * (`checkpoint-conflict.ts`, `account-conflict.ts`): better-sqlite3 raises
 * `code = 'SQLITE_CONSTRAINT_UNIQUE'`, drizzle wraps it as `.cause`, so the
 * chain is walked. The broader `SQLITE_CONSTRAINT` family is accepted as a
 * fallback for a driver that drops the suffix.
 */
const MAX_CAUSE_DEPTH = 5;

export function isSourceRefConflict(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current instanceof Error; depth += 1) {
    if (matchesSourceRefUnique(current)) return true;
    const next: unknown = (current as { cause?: unknown }).cause;
    if (next === current) return false;
    current = next;
  }
  return false;
}

function matchesSourceRefUnique(err: Error): boolean {
  const code: unknown = (err as { code?: unknown }).code;
  if (typeof code !== 'string') return false;
  if (code !== 'SQLITE_CONSTRAINT_UNIQUE' && code !== 'SQLITE_CONSTRAINT') return false;
  return (
    /UNIQUE constraint failed: home_inventory\.source_ref/.test(err.message) ||
    /UNIQUE constraint failed: index 'idx_inventory_source_ref'/.test(err.message)
  );
}
