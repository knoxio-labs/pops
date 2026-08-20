/**
 * Helpers for the generated Hey API finance SDK.
 *
 * Lives outside `src/finance-api/` because codegen wipes that
 * directory on every regeneration. Anything hand-authored here is safe.
 *
 * `unwrap` turns a Hey API `{ data, error, response }` result into its
 * data payload, throwing `FinanceApiError` (carrying the HTTP status)
 * on failure — `isUnavailableError` classifies a 5xx/no-status failure so
 * call sites can render an "unavailable" state instead of a generic error.
 */

interface SdkErrorBody {
  message?: unknown;
}

/**
 * What a status means to someone looking at the screen, for the failures that
 * carry no usable body.
 *
 * A failure rejected by the proxy rather than the pillar — a 413 from nginx, a
 * 502 from an absent upstream — answers with an HTML error page, so there is no
 * `message` field to show and the generic fallback tells the user nothing about
 * what went wrong or whether they can act on it. These are the statuses where
 * the status alone is enough to say something true and useful.
 */
const STATUS_REASON: Readonly<Record<number, string>> = {
  401: 'not authorised',
  403: 'not permitted',
  404: 'not found',
  408: 'the server timed out waiting for the request',
  413: 'the request was too large for the server to accept',
  429: 'too many requests — try again shortly',
  502: 'the finance service is unreachable',
  503: 'the finance service is unavailable',
  504: 'the finance service timed out',
};

/**
 * Build the message shown when the response body carries none. Always names the
 * status, so an unmapped failure is still traceable to a specific HTTP code
 * rather than collapsing into one indistinguishable string.
 */
function describeFailure(status: number | undefined): string {
  if (status === undefined) return 'finance API request failed — no response from the server';
  const reason = STATUS_REASON[status];
  return reason
    ? `finance API request failed: ${reason} (HTTP ${status})`
    : `finance API request failed (HTTP ${status})`;
}

export class FinanceApiError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status: number | undefined) {
    super(message);
    this.name = 'FinanceApiError';
    this.status = status;
  }
}

export function unwrap<T>(result: { data?: T; error?: unknown; response?: Response }): T {
  if (result.error !== undefined) {
    const body = result.error as SdkErrorBody;
    const status = result.response?.status;
    const message =
      typeof body.message === 'string' && body.message.length > 0
        ? body.message
        : describeFailure(status);
    throw new FinanceApiError(message, status);
  }
  if (result.data === undefined) {
    throw new FinanceApiError('finance API returned no data', result.response?.status);
  }
  return result.data;
}

/** True when the pillar was unreachable or errored server-side (no status / 5xx). */
export function isUnavailableError(err: unknown): boolean {
  return err instanceof FinanceApiError && (err.status === undefined || err.status >= 500);
}
