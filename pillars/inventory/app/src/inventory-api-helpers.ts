import { ApiError, unwrap as unwrapApi } from '@pops/pillar-sdk/client';

import { reportResponse } from './foundation/interruptions/interruption-store.js';

import type { ApiErrorIssue, ApiResult } from '@pops/pillar-sdk/client';

/** One definition-level validation issue returned by catalogue authoring. */
export type InventoryApiIssue = ApiErrorIssue;

export { ApiError as InventoryApiError };

type InventoryApiResponseWithUrl = NonNullable<ApiResult<unknown>['response']> & {
  readonly url: string;
};

function hasUrl(response: ApiResult<unknown>['response']): response is InventoryApiResponseWithUrl {
  return response !== undefined && 'url' in response && typeof response.url === 'string';
}

function reportInventoryResponse(response: ApiResult<unknown>['response']): void {
  if (hasUrl(response)) reportResponse(response);
}

/** Returns an inventory client payload or throws the shared browser {@link ApiError}. */
export function unwrap<T>(result: ApiResult<T>): T {
  reportInventoryResponse(result.response);
  return unwrapApi(result, {
    fallbackMessage: 'inventory API request failed',
    noDataMessage: 'inventory API returned no data',
  });
}

/** True when the failure was a 404 (entity missing). */
export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/** True when the inventory pillar was unreachable or errored server-side. */
export function isUnavailableError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.kind === 'offline' || error.kind === 'timeout' || error.kind === 'server')
  );
}
