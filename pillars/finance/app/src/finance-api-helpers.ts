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
    const message =
      typeof body.message === 'string' && body.message.length > 0
        ? body.message
        : 'finance API request failed';
    throw new FinanceApiError(message, result.response?.status);
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
