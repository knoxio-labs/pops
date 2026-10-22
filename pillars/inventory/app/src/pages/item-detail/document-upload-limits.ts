import { formatBytes } from '@pops/ui';

import type { FileValidationErrorReason } from '@pops/ui';

import type { PaperlessStatusResponse } from '../../inventory-api/types.gen.js';
import type { DocumentUploadLimits } from './detail-model-types';

type StatusLimits = Pick<PaperlessStatusResponse['data'], 'maxUploadBytes' | 'allowedMimeTypes'>;

/**
 * Reads documents' upload cap and MIME allowlist from inventory's Paperless
 * status. Documents leaves them null when it cannot state them; the upload is
 * then checked by the server only, never against a guessed limit.
 */
export function uploadLimitsOf(
  status: StatusLimits | null | undefined
): DocumentUploadLimits | null {
  if (status === null || status === undefined) return null;
  const { maxUploadBytes, allowedMimeTypes } = status;
  if (maxUploadBytes === null || allowedMimeTypes === null || allowedMimeTypes.length === 0) {
    return null;
  }
  return { maxUploadBytes, allowedMimeTypes };
}

/** The `accept` list a file picker and the pre-check use for these limits. */
export function acceptFor(limits: DocumentUploadLimits): string {
  return limits.allowedMimeTypes.join(',');
}

/** Phrases why a file was refused before any upload was attempted. */
export function uploadRefusal(reason: FileValidationErrorReason): string {
  if (reason.type === 'too-large') {
    return `${reason.file.name} is ${formatBytes(reason.file.size)}. Paperless takes files up to ${formatBytes(reason.maxSize)}.`;
  }
  if (reason.type === 'not-accepted') {
    const fileType = reason.file.type.length > 0 ? reason.file.type : 'an unknown type';
    return `${reason.file.name} is ${fileType}. Paperless takes ${reason.accept.split(',').join(', ')}.`;
  }
  return `Add one file at a time. You added ${reason.attempted}.`;
}
