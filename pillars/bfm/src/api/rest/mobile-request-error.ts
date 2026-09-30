import { getRequestId, mintRequestId } from '@pops/pillar-sdk/server';

import type { MobileRequestError } from '../../contract/rest-schemas.js';

/** Build a mobile request error that tells the caller to restart pagination. */
export function invalidMobileCursorResponse(message: string): {
  readonly status: 400;
  readonly body: MobileRequestError;
} {
  return {
    status: 400 as const,
    body: {
      code: 'invalid_cursor' as const,
      message,
      requestId: getRequestId() ?? mintRequestId(),
      retryable: false,
    },
  };
}
