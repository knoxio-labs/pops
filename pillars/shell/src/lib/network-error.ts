import { ApiError } from '@pops/pillar-sdk/client';

function causeOf(error: object): unknown {
  return 'cause' in error ? error.cause : undefined;
}

/** True when an API failure was classified from a fetch or abort rejection. */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiError) return error.kind === 'offline' || error.kind === 'timeout';
  if (typeof error !== 'object' || error === null) return false;
  const cause = causeOf(error);
  return cause === undefined ? false : isNetworkError(cause);
}
