import { ApiError } from '@pops/pillar-sdk/client';

import { CaptureUploadContextError } from './upload-authority';

import type { CaptureIntent } from './editor-types';

/** This source's confirmed validation/auth/ownership conflicts cannot have committed its mutation. */
export function captureRequestRejected(error: unknown): boolean {
  return (
    (error instanceof CaptureUploadContextError && !error.priorDispatch) ||
    (error instanceof ApiError &&
      error.status !== undefined &&
      [400, 401, 403, 404, 409, 422].includes(error.status))
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

/** Exact owning revision rejection; other conflicts and ambiguous outcomes keep immutable Retry. */
export function captureRevisionConflict(error: unknown, intent: CaptureIntent | null): boolean {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.code === 'trips.source.source_revision_conflict' &&
    intent !== null &&
    (intent.request.command.kind === 'capture.update' ||
      intent.request.command.kind === 'idea.update')
  );
}
