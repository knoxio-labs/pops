/**
 * Client-side matching helpers.
 *
 * Extracted from correction-proposal-shared.ts (tb-365).
 */
import { normalizeDescription, patternMatchesNormalizedDescription } from '@pops/finance';

export { normalizeDescription };

/**
 * Does a transaction description hit a `(pattern, matchType)` signal?
 *
 * Delegates to `patternMatchesNormalizedDescription`, the one predicate every
 * server match path also runs (POPS-2600), so the detail editor's live scope
 * count cannot disagree with what the server matches on apply. This wrapper
 * used to carry its own copy that tested regex with **no `i` flag**, on the
 * stated grounds that the server did the same — only one of the server's four
 * matchers did, and it was the buggy one.
 */
export function transactionMatchesSignal(
  description: string,
  pattern: string,
  matchType: 'exact' | 'contains' | 'regex'
): boolean {
  return patternMatchesNormalizedDescription(pattern, matchType, normalizeDescription(description));
}
