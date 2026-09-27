import { ApiError, unwrap as unwrapApi } from '@pops/pillar-sdk/client';

import type { ApiResult } from '@pops/pillar-sdk/client';

export { ApiError as ContactsApiError };

/** Returns a contacts client payload or throws the shared browser {@link ApiError}. */
export function unwrap<T>(result: ApiResult<T>): T {
  return unwrapApi(result, {
    fallbackMessage: 'contacts API request failed',
    noDataMessage: 'contacts API returned no data',
  });
}

/** True when contacts was unreachable or errored server-side. */
export function isUnavailableError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.kind === 'offline' || error.kind === 'timeout' || error.kind === 'server')
  );
}
