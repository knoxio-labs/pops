/**
 * Client-side matching helpers.
 *
 * Extracted from correction-proposal-shared.ts (tb-365).
 */
import { normalizeDescription } from '@pops/finance';

export { normalizeDescription };

/**
 * Mirror the server matcher in `findMatchingCorrectionFromRules` / the
 * preview pipeline. Semantics:
 *  - For `exact`/`contains`: both sides are normalized via `normalizeDescription`
 *    (patterns are stored already-normalized in the DB, but we normalize the
 *    client-side pattern too because the user can type a raw value in the
 *    detail editor before the server has a chance to normalize it).
 *  - For `regex`: pattern is kept raw (server stores regex patterns raw) and
 *    tested with `new RegExp(pattern)` — **no `i` flag** — against the
 *    *normalized* description. Using the `i` flag here, or testing against
 *    the raw description, would silently diverge from what the server preview
 *    engine matches and scope out transactions that actually hit on apply.
 */
export function transactionMatchesSignal(
  description: string,
  pattern: string,
  matchType: 'exact' | 'contains' | 'regex'
): boolean {
  const normDesc = normalizeDescription(description);
  if (matchType === 'regex') {
    if (pattern.length === 0) return false;
    try {
      return new RegExp(pattern).test(normDesc);
    } catch {
      return false;
    }
  }
  const normPattern = normalizeDescription(pattern);
  if (!normPattern) return false;
  if (matchType === 'exact') return normDesc === normPattern;
  return normDesc.includes(normPattern);
}
