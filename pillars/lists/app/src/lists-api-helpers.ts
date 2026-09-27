import { unwrap as unwrapApi } from '@pops/pillar-sdk/client';

import type { ApiResult } from '@pops/pillar-sdk/client';

/** Returns a lists client payload or throws the shared browser `ApiError`. */
export function unwrap<T>(result: ApiResult<T>): T {
  return unwrapApi(result, {
    fallbackMessage: 'lists API request failed',
    noDataMessage: 'lists API returned no data',
  });
}
