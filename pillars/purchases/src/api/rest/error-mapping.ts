/**
 * Map purchases service errors to ts-rest response envelopes. Anything
 * unrecognised is re-thrown so Express's error pipeline (and the test
 * suite) sees the underlying stack rather than a swallowed 500.
 */
import {
  DocumentAlreadyAttachedError,
  DuplicatePurchaseError,
  InvalidIngestPayloadError,
  InventoryLinkClearFailedError,
  InventoryProposalConflictError,
  ProductDictionaryNotFoundError,
  PurchaseLockedError,
  PurchaseNotFoundError,
  PurchaseSourceNotFoundError,
  PurchaseStaleError,
} from '../../db/index.js';
import { purchaseErrorBody, type PurchaseErrorReason } from '../errors.js';
import {
  isCheckConstraintError,
  isForeignKeyConstraintError,
  isUniqueConstraintError,
} from '../shared/sqlite-errors.js';

import type { ErrorBody } from '@pops/types';

export interface MappedHttpError {
  status: 400 | 404 | 409 | 502;
  body: ErrorBody;
}

function mapped(status: MappedHttpError['status'], reason: PurchaseErrorReason): MappedHttpError {
  return { status, body: purchaseErrorBody(reason) };
}

function mapConstraintError(err: unknown): MappedHttpError | null {
  if (isUniqueConstraintError(err)) {
    return {
      status: 409,
      body: purchaseErrorBody('unique_conflict'),
    };
  }
  if (isForeignKeyConstraintError(err)) {
    return {
      status: 409,
      body: purchaseErrorBody('foreign_key_conflict'),
    };
  }
  // A CHECK rejection means the caller sent a value the schema's closed
  // vocabulary or non-negativity rules forbid — that's a bad request, not a
  // conflict, and the 400 tells the caller to fix the payload.
  if (isCheckConstraintError(err)) {
    return {
      status: 400,
      body: purchaseErrorBody('check_failed'),
    };
  }
  return null;
}

export function tryMapServiceError(err: unknown): MappedHttpError | null {
  if (
    err instanceof PurchaseNotFoundError ||
    err instanceof PurchaseSourceNotFoundError ||
    err instanceof ProductDictionaryNotFoundError
  )
    return mapped(404, 'not_found');
  if (err instanceof DuplicatePurchaseError) return mapped(409, 'duplicate');
  if (err instanceof InvalidIngestPayloadError) return mapped(400, 'invalid_ingest_payload');
  if (err instanceof DocumentAlreadyAttachedError) return mapped(409, 'already_attached');
  if (err instanceof InventoryProposalConflictError) return mapped(409, 'already_decided');
  if (err instanceof PurchaseLockedError) return mapped(409, 'locked');
  if (err instanceof PurchaseStaleError) return mapped(409, 'stale');
  if (err instanceof InventoryLinkClearFailedError) return mapped(502, 'unavailable');
  return mapConstraintError(err);
}
