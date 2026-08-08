import { BfmApiError, isUnavailableError } from '../../bfm-api-helpers.js';

/**
 * How an operator request failed, in the terms the page has to act on.
 *
 * `unavailable` is bfm being unreachable or 5xx — nothing the operator did.
 * `refused` carried a status, which is a different problem entirely (a
 * Cloudflare Access session that lapsed, a proxy pointed at the wrong host),
 * and collapsing the two into "bfm is down" sends the operator hunting the
 * wrong thing. `rate-limited` is any 429, and it earns its own case because
 * the fix is to wait rather than to go looking for a broken thing.
 *
 * Today only `POST /operator/pairing/codes` is metered, so that is the only
 * route a 429 can come back from — but this classifier is shared by all three,
 * and each of them maps the verdict through its own exhaustive key record. The
 * point is that metering a second route stays a server-side change: nothing
 * here has to be found and widened first.
 */
export type OperatorFailure = 'unavailable' | 'rate-limited' | 'refused';

export function classifyOperatorFailure(err: unknown): OperatorFailure {
  if (isUnavailableError(err)) return 'unavailable';
  if (err instanceof BfmApiError && err.status === 429) return 'rate-limited';
  return 'refused';
}
