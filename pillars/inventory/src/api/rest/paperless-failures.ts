/**
 * Inventory's answer when a documents-pillar write it depends on fails.
 *
 * Shaped like documents' own registered failures so a caller sees the same
 * meaning either way: 412 when Paperless is unconfigured, 503 when it (or
 * documents) cannot be reached, 502 for any other unexpected answer, and 404
 * only when Paperless says the document is gone.
 */
import { inventoryError } from '../errors.js';

import type { PopsError } from '@pops/pillar-express';
import type { CallFailure } from '@pops/pillar-sdk/client';

/** Map a failed Paperless title change to the error the link edit answers with. */
export function titleSyncError(failure: CallFailure): PopsError {
  switch (failure.kind) {
    case 'not-found':
      return inventoryError({
        area: 'documents',
        reason: 'paperless_document_missing',
        status: 404,
        message: 'The Paperless document no longer exists.',
      });
    case 'refused':
      return failure.status === 412
        ? inventoryError({
            area: 'documents',
            reason: 'paperless_not_configured',
            status: 412,
            message: 'Paperless-ngx is not configured.',
          })
        : upstreamFailure();
    case 'unavailable':
    case 'degraded':
    case 'rate-limited':
      return inventoryError({
        area: 'documents',
        reason: 'unavailable',
        status: 503,
        message: 'The documents service could not be reached.',
        retryable: true,
      });
    case 'bad-request':
    case 'conflict':
    case 'unauthorized':
    case 'contract-mismatch':
      return upstreamFailure();
  }
}

function upstreamFailure(): PopsError {
  return inventoryError({
    area: 'documents',
    reason: 'upstream_failure',
    status: 502,
    message: 'The documents service returned an unexpected response.',
    retryable: true,
  });
}
