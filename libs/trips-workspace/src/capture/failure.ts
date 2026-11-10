import { ApiError } from '@pops/pillar-sdk/client';

/** This source's confirmed validation/auth/ownership conflicts cannot have committed its mutation. */
export function captureRequestRejected(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status !== undefined &&
    [400, 401, 403, 404, 409, 422].includes(error.status)
  );
}
/** Preserve the approved conflict wording and avoid changing either composer or source. */
export function occupiedCaptureComposer(): ApiError {
  return new ApiError({
    code: 'trips.capture.composer_occupied',
    kind: 'client',
    message: 'Finish or clear the current draft before undoing capture.',
    retryable: false,
  });
}
/** Distinguish a resolved undone replay from a new successful capture. */
export function alreadyUndoneCapture(): ApiError {
  return new ApiError({
    code: 'trips.capture.already_undone',
    kind: 'client',
    message: 'This operation was already undone. Review the retained draft and capture again.',
    retryable: false,
  });
}
