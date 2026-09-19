/**
 * Recognise the `items.code` unique violation (POPS-4124).
 *
 * The legacy `/items` create route writes `assetId` straight onto `code`
 * without checking for a holder first (unlike `item.setCode`, which checks
 * `findCodeHolder` itself and raises a typed `code_collision` conflict).
 * `items_code` is a plain, always-unique index — a sticker stays reserved to
 * whichever item last wore it, deleted or not (ADR-002 D7) — so a legacy
 * create naming an already-held code raises `SQLITE_CONSTRAINT_UNIQUE` on
 * `items_code`, which the route maps to a 409 rather than letting it surface
 * as an unhandled 500.
 *
 * Message-matched against the index name, not just the code, for the same
 * reason `isSourceRefConflict` is: `items` carries two other unique indexes
 * (`source_ref`, `notion_id`) that must not be misread as a code collision.
 */
const MAX_CAUSE_DEPTH = 5;

export function isCodeConflict(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current instanceof Error; depth += 1) {
    if (matchesCodeUnique(current)) return true;
    const next: unknown = (current as { cause?: unknown }).cause;
    if (next === current) return false;
    current = next;
  }
  return false;
}

function matchesCodeUnique(err: Error): boolean {
  const code: unknown = (err as { code?: unknown }).code;
  if (typeof code !== 'string') return false;
  if (code !== 'SQLITE_CONSTRAINT_UNIQUE' && code !== 'SQLITE_CONSTRAINT') return false;
  return (
    /UNIQUE constraint failed: items\.code/.test(err.message) ||
    /UNIQUE constraint failed: index 'items_code'/.test(err.message)
  );
}
