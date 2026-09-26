import { unwrap } from '@pops/pillar-sdk/client';

import type { ApiResult } from '@pops/pillar-sdk/client';

/** Returns a lists client payload or throws the shared browser `ApiError`. */
export function unwrapLists<T>(result: ApiResult<T>): T {
  return unwrap(result, {
    fallbackMessage: 'lists API request failed',
    noDataMessage: 'lists API returned no data',
  });
}
