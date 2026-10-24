/**
 * Inventory's answer when a documents-pillar call it depends on fails.
 *
 * Shaped like documents' own registered failures so a caller sees the same
 * meaning either way: 412 only when documents says Paperless is unconfigured,
 * 503 when Paperless (or documents) cannot be reached, 502 for any other
 * unexpected answer, and 404 only when Paperless says the document is gone.
 */
import { inventoryError } from '../errors.js';

import type { PopsError } from '@pops/pillar-express';
import type { CallFailure } from '@pops/pillar-sdk/client';

/** What a failed call to documents means for the caller. */
export type PaperlessFailure = 'missing' | 'not_configured' | 'unavailable' | 'upstream';

/** Classify a failed documents call; only documents' own 412 means "not configured". */
export function classifyPaperlessFailure(failure: CallFailure): PaperlessFailure {
  switch (failure.kind) {
    case 'not-found':
      return 'missing';
    case 'refused':
      return failure.status === 412 ? 'not_configured' : 'upstream';
    case 'unavailable':
    case 'degraded':
    case 'rate-limited':
      return 'unavailable';
    case 'bad-request':
    case 'conflict':
    case 'unauthorized':
    case 'contract-mismatch':
      return 'upstream';
  }
}

/** Map a failed Paperless title change to the error the link edit answers with. */
export function titleSyncError(failure: CallFailure): PopsError {
  switch (classifyPaperlessFailure(failure)) {
    case 'missing':
      return inventoryError({
        area: 'documents',
        reason: 'paperless_document_missing',
        status: 404,
        message: 'The Paperless document no longer exists.',
      });
    case 'not_configured':
      return inventoryError({
        area: 'documents',
        reason: 'paperless_not_configured',
        status: 412,
        message: 'Paperless-ngx is not configured.',
      });
    case 'unavailable':
      return unavailable('documents');
    case 'upstream':
      return upstreamFailure('documents');
  }
}

/** Map a failed Paperless search to the error `paperless.search` answers with. */
export function searchError(failure: CallFailure): PopsError {
  switch (classifyPaperlessFailure(failure)) {
    case 'not_configured':
      return inventoryError({
        area: 'paperless',
        reason: 'not_configured',
        status: 412,
        message: 'Paperless-ngx is not configured',
        details: { messageKey: 'inventory.paperless.notConfigured' },
      });
    case 'unavailable':
      return unavailable('paperless');
    case 'missing':
    case 'upstream':
      return upstreamFailure('paperless');
  }
}

function unavailable(area: string): PopsError {
  return inventoryError({
    area,
    reason: 'unavailable',
    status: 503,
    message: 'Paperless could not be reached. Try again shortly.',
    retryable: true,
  });
}

function upstreamFailure(area: string): PopsError {
  return inventoryError({
    area,
    reason: 'upstream_failure',
    status: 502,
    message: 'The documents service returned an unexpected response.',
    retryable: true,
  });
}
