import { getPillar } from '../pillar-client.js';
import { documentsReadContracts } from './documents-owner-contract.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

/** Finite Documents-owned bridge operations; the SDK resolves their live OpenAPI routes and producer errors. */
export type DocumentsOwnerShape = {
  paperless: {
    status: () => unknown;
    search: (input: { query: string }) => unknown;
    get: (input: { id: number }) => unknown;
    task: (input: { taskId: string }) => unknown;
  };
};

/** Direct owner handle; no Inventory record or association is involved. */
export function documentsOwner(): PillarHandle<DocumentsOwnerShape> {
  return getPillar<DocumentsOwnerShape>('documents');
}

/** Upload limits are accepted only as explicit current owner metadata, never filename guesses or local defaults. */
export function documentUploadPolicy(
  value: unknown
): { maxBytes: number; allowedMimeTypes: string[] } | undefined {
  if (!documentsReadContracts.status.response(value).valid) return undefined;
  if (typeof value !== 'object' || value === null || !('data' in value)) return undefined;
  const data = value.data;
  if (!isAvailable(data) || !isPolicy(data)) return undefined;
  return { maxBytes: data.maxUploadBytes, allowedMimeTypes: [...data.allowedMimeTypes] };
}

function isAvailable(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'configured' in value &&
    value.configured === true &&
    'available' in value &&
    value.available === true
  );
}
function isPolicy(value: unknown): value is { maxUploadBytes: number; allowedMimeTypes: string[] } {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('maxUploadBytes' in value) ||
    !('allowedMimeTypes' in value)
  )
    return false;
  return (
    typeof value.maxUploadBytes === 'number' &&
    Number.isSafeInteger(value.maxUploadBytes) &&
    value.maxUploadBytes > 0 &&
    Array.isArray(value.allowedMimeTypes) &&
    value.allowedMimeTypes.every(
      (mime): mime is string => typeof mime === 'string' && mime.length > 0
    )
  );
}
