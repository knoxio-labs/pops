import { ApiError, unwrap as unwrapApi } from '@pops/pillar-sdk/client';

import type { ApiResult } from '@pops/pillar-sdk/client';

export { ApiError as PurchasesApiError };

/** Returns a purchases client payload or throws the shared browser {@link ApiError}. */
export function unwrap<T>(result: ApiResult<T>): T {
  return unwrapApi(result, {
    fallbackMessage: 'purchases API request failed',
    noDataMessage: 'purchases pillar did not answer in its own contract',
  });
}

/** True when the purchases pillar did not answer in its contract or failed server-side. */
export function isUnavailableError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.kind === 'offline' || error.kind === 'timeout' || error.kind === 'server') return true;
  if (error.code === 'web.client.no_data') return true;
  return error.code.startsWith('web.http.') && error.details === undefined;
}
