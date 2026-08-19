/**
 * Helpers for the generated Hey API purchases SDK.
 *
 * Lives outside `src/purchases-api/` because codegen wipes that directory on
 * every regeneration. Anything hand-authored here is safe.
 *
 * `unwrap` turns a Hey API `{ data, error, response }` result into its data
 * payload, throwing `PurchasesApiError` (carrying the HTTP status) on failure.
 * `isUnavailableError` classifies a 5xx/no-status failure, which matters more
 * on this leg than on finance's own: purchases is a separate deployment, and a
 * finance view that reported its own transaction as broken because a sibling
 * pillar was down would be blaming the wrong thing.
 */

interface SdkErrorBody {
  message?: unknown;
}

export class PurchasesApiError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status: number | undefined) {
    super(message);
    this.name = 'PurchasesApiError';
    this.status = status;
  }
}

export function unwrap<T>(result: { data?: T; error?: unknown; response?: Response }): T {
  if (result.error !== undefined) {
    const body = result.error as SdkErrorBody;
    const message =
      typeof body.message === 'string' && body.message.length > 0
        ? body.message
        : 'purchases API request failed';
    throw new PurchasesApiError(message, result.response?.status);
  }
  if (result.data === undefined) {
    throw new PurchasesApiError('purchases API returned no data', result.response?.status);
  }
  return result.data;
}

/** True when the pillar was unreachable or errored server-side (no status / 5xx). */
export function isUnavailableError(err: unknown): boolean {
  return err instanceof PurchasesApiError && (err.status === undefined || err.status >= 500);
}
