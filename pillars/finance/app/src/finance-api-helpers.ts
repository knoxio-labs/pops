import { ApiError, unwrap as unwrapApi } from '@pops/pillar-sdk/client';

import type { ApiResult } from '@pops/pillar-sdk/client';

const STATUS_REASON: Readonly<Record<number, string>> = {
  401: 'not authorised',
  403: 'not permitted',
  404: 'not found',
  408: 'the server timed out waiting for the request',
  413: 'the request was too large for the server to accept',
  429: 'too many requests — try again shortly',
  502: 'the finance service is unreachable',
  503: 'the finance service is unavailable',
  504: 'the finance service timed out',
};

function describeFailure(status: number | undefined): string {
  if (status === undefined) return 'finance API request failed — no response from the server';
  const reason = STATUS_REASON[status];
  return reason === undefined
    ? `finance API request failed (HTTP ${String(status)})`
    : `finance API request failed: ${reason} (HTTP ${String(status)})`;
}

export { ApiError as FinanceApiError };

/** Returns a finance client payload or throws the shared browser {@link ApiError}. */
export function unwrap<T>(result: ApiResult<T>): T {
  return unwrapApi(result, {
    fallbackMessage: describeFailure,
    noDataMessage: 'finance API returned no data',
  });
}

/** True when the finance pillar was unreachable or errored server-side. */
export function isUnavailableError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.kind === 'offline' || error.kind === 'timeout' || error.kind === 'server')
  );
}
