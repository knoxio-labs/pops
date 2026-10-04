import { defineErrors } from '@pops/pillar-express';

import { createErrorBodyBuilder } from './error-body-builder.js';
import {
  RECONCILIATION_ERROR_DEFINITIONS,
  reconciliationErrors,
} from './reconciliation-error-definitions.js';

const ERROR_DEFINITIONS = {
  not_found: {
    area: 'resource',
    status: 404,
    message: 'The requested purchases resource was not found.',
    retryable: false,
  },
  duplicate: {
    area: 'purchase',
    status: 409,
    message: 'This purchase has already been recorded.',
    retryable: false,
  },
  invalid_ingest_payload: {
    area: 'purchase',
    status: 400,
    message: 'The purchase payload is inconsistent.',
    retryable: false,
  },
  unknown_shared_tag: {
    area: 'shared_tag',
    status: 400,
    message: 'The shared tag id is not in the Purchases vocabulary cache.',
    retryable: false,
  },
  already_attached: {
    area: 'document',
    status: 409,
    message: 'This document is already attached to the purchase.',
    retryable: false,
  },
  already_decided: {
    area: 'inventory_proposal',
    status: 409,
    message: 'This inventory proposal has already been decided.',
    retryable: false,
  },
  locked: {
    area: 'purchase',
    status: 409,
    message: 'This purchase is locked and cannot be edited.',
    retryable: false,
  },
  stale: {
    area: 'purchase',
    status: 409,
    message: 'This purchase changed after it was loaded. Refresh it and try again.',
    retryable: true,
  },
  unavailable: {
    area: 'inventory',
    status: 502,
    message: 'Inventory is unavailable. Try again later.',
    retryable: true,
  },
  unique_conflict: {
    area: 'storage',
    status: 409,
    message: 'A purchase record with that identity already exists.',
    retryable: false,
  },
  foreign_key_conflict: {
    area: 'storage',
    status: 409,
    message: 'The operation refers to a purchases resource that does not exist.',
    retryable: false,
  },
  check_failed: {
    area: 'storage',
    status: 400,
    message: 'The request contains a value purchases cannot accept.',
    retryable: false,
  },
  database_busy: {
    area: 'storage',
    status: 503,
    message: 'Purchase storage is busy. Retry this request shortly.',
    retryable: true,
  },
  keyset_anchor_incomplete: {
    area: 'request',
    status: 400,
    message: 'Both keyset anchor values are required.',
    retryable: false,
  },
  unreadable_timestamp: {
    area: 'request',
    status: 400,
    message: 'The timestamp is invalid.',
    retryable: false,
  },
  merchant_filter_conflict: {
    area: 'request',
    status: 400,
    message: 'Choose only one merchant filter.',
    retryable: false,
  },
  unsupported_filter: {
    area: 'search',
    status: 400,
    message: 'The search filter is not supported.',
    retryable: false,
  },
  invalid_cursor: {
    area: 'request',
    status: 400,
    message: 'The continuation cursor is invalid for this query. Start the list again.',
    retryable: false,
  },
  already_imported: {
    area: 'receipt',
    status: 409,
    message: 'This receipt has already been imported.',
    retryable: false,
  },
  inconsistent_total: {
    area: 'purchase',
    status: 400,
    message: 'The purchase totals are inconsistent.',
    retryable: false,
  },
  not_stored: {
    area: 'receipt',
    status: 404,
    message: 'The receipt is not stored.',
    retryable: false,
  },
  not_an_image: {
    area: 'receipt',
    status: 415,
    message: 'This receipt is not an image and has no thumbnail.',
    retryable: false,
  },
  undecodable: {
    area: 'receipt',
    status: 415,
    message: 'The stored receipt could not be decoded as an image.',
    retryable: false,
  },
  vision_unavailable: {
    area: 'receipt',
    status: 503,
    message: 'Receipt reading is not configured.',
    retryable: false,
  },
  invalid_media_type: {
    area: 'receipt',
    status: 400,
    message: 'The uploaded bytes do not match the stated media type.',
    retryable: false,
  },
  unauthorized: {
    area: 'inventory',
    status: 502,
    message: 'Inventory refused the purchases service account.',
    retryable: false,
  },
  refused: {
    area: 'inventory',
    status: 502,
    message: 'Inventory refused the asset.',
    retryable: false,
  },
  response_unreadable: {
    area: 'inventory',
    status: 502,
    message: 'Inventory returned an unreadable response.',
    retryable: false,
  },
  accept_not_recorded: {
    area: 'inventory',
    status: 502,
    message: 'The inventory asset was created, but the acceptance was not recorded.',
    retryable: false,
  },
} as const;

const ALL_ERROR_DEFINITIONS = {
  ...ERROR_DEFINITIONS,
  ...RECONCILIATION_ERROR_DEFINITIONS,
};

export type PurchaseErrorReason = keyof typeof ALL_ERROR_DEFINITIONS;

/** Typed throwing helpers for every purchases-owned error code. */
export const purchaseErrors = {
  ...defineErrors('purchases', ERROR_DEFINITIONS),
  ...reconciliationErrors,
};

/**
 * Build an ADR-054 response for contract handlers that return declared error statuses.
 * Request middleware establishes the id; the fallback only supports isolated unit calls.
 */
export const purchaseErrorBody = createErrorBodyBuilder('purchases', ALL_ERROR_DEFINITIONS);
