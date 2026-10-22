import { z } from 'zod';

import { formatBytes } from '@pops/ui';

import type { FileValidationErrorReason } from '@pops/ui';

import type { DocumentUploadLimits } from './detail-model-types';

const UploadLimitsSchema = z.object({
  maxUploadBytes: z.number().int().positive(),
  allowedMimeTypes: z.array(z.string().min(1)).min(1),
});

/**
 * Reads documents' upload cap and MIME allowlist from a Paperless status
 * payload. The limits belong to documents and inventory only passes them on,
 * so a status without them yields null rather than a guessed limit.
 */
export function uploadLimitsOf(status: object | null | undefined): DocumentUploadLimits | null {
  const parsed = UploadLimitsSchema.safeParse(status);
  return parsed.success ? parsed.data : null;
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
