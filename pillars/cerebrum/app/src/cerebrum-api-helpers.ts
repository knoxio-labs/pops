import { ApiError, unwrap as unwrapApi } from '@pops/pillar-sdk/client';

import type { ApiResult } from '@pops/pillar-sdk/client';

export { ApiError as CerebrumApiError };

/** Returns a Cerebrum client payload or throws the shared browser {@link ApiError}. */
export function unwrap<T>(result: ApiResult<T>): T {
  return unwrapApi(result, {
    fallbackMessage: 'cerebrum API request failed',
    noDataMessage: 'cerebrum API returned no data',
  });
}

/** True when the failure was a 404 (entity missing). */
export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/** True when the pillar was unreachable or errored server-side. */
export function isUnavailableError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.kind === 'offline' || error.kind === 'timeout' || error.kind === 'server')
  );
}
