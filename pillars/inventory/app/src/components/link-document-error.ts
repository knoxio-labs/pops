import { InventoryApiError } from '../inventory-api-helpers.js';

/** Preserves API diagnostics while giving document conflicts their existing friendly message. */
export function linkDocumentError(error: Error): InventoryApiError {
  const apiError =
    error instanceof InventoryApiError
      ? error
      : new InventoryApiError({
          code: 'web.client.unknown',
          kind: 'client',
          message: 'Failed to link document',
          retryable: false,
        });
  if (apiError.status !== 409) return apiError;
  return new InventoryApiError({
    code: apiError.code,
    details: apiError.details,
    kind: apiError.kind,
    message: 'This document is already linked to this item',
    requestId: apiError.requestId,
    retryable: apiError.retryable,
    status: apiError.status,
  });
}
