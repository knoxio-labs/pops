import { unwrap as unwrapApi } from '@pops/pillar-sdk/client';

import type { ApiResult } from '@pops/pillar-sdk/client';

/** Returns a purchases client payload or throws the shared browser `ApiError`. */
export function unwrap<T>(result: ApiResult<T>): T {
  return unwrapApi(result, {
    fallbackMessage: 'purchases API request failed',
    noDataMessage: 'purchases API returned no data',
  });
}
