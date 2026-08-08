import { BfmApiError, isUnavailableError } from '../../bfm-api-helpers.js';

/**
 * How an operator request failed, in the terms the page has to act on.
 *
 * `unavailable` is bfm being unreachable or 5xx — nothing the operator did.
 * `refused` carried a status, which is a different problem entirely (a
 * Cloudflare Access session that lapsed, a proxy pointed at the wrong host),
 * and collapsing the two into "bfm is down" sends the operator hunting the
 * wrong thing. `rate-limited` is the issuance budget, which only minting can
 * hit — it is its own case because the fix is to wait, not to retry.
 */
export type OperatorFailure = 'unavailable' | 'rate-limited' | 'refused';

export function classifyOperatorFailure(err: unknown): OperatorFailure {
  if (isUnavailableError(err)) return 'unavailable';
  if (err instanceof BfmApiError && err.status === 429) return 'rate-limited';
  return 'refused';
}
