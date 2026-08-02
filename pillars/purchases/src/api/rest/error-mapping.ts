/**
 * Map purchases service errors to ts-rest response envelopes. Anything
 * unrecognised is re-thrown so Express's error pipeline (and the test
 * suite) sees the underlying stack rather than a swallowed 500.
 */
import {
  DuplicatePurchaseError,
  InvalidIngestPayloadError,
  PurchaseNotFoundError,
  PurchaseSourceNotFoundError,
} from '../../db/index.js';
import {
  isCheckConstraintError,
  isForeignKeyConstraintError,
  isUniqueConstraintError,
} from '../shared/sqlite-errors.js';

export interface ErrorBody {
  message: string;
  code?: string;
}

export interface MappedHttpError {
  status: 400 | 404 | 409;
  body: ErrorBody;
}

export function tryMapServiceError(err: unknown): MappedHttpError | null {
  if (err instanceof PurchaseNotFoundError || err instanceof PurchaseSourceNotFoundError) {
    return { status: 404, body: { message: err.message, code: 'NOT_FOUND' } };
  }
  // Not a failure: an adapter re-ingesting a bundle it has already
  // processed lands here and treats the 409 as "already have it".
  if (err instanceof DuplicatePurchaseError) {
    return { status: 409, body: { message: err.message, code: 'DUPLICATE_PURCHASE' } };
  }
  // A self-inconsistent payload is the caller's mistake. Returning 500
  // would leave an adapter unable to distinguish a bad payload from a
  // broken pillar, and reasonably retrying forever.
  if (err instanceof InvalidIngestPayloadError) {
    return { status: 400, body: { message: err.message, code: 'INVALID_INGEST_PAYLOAD' } };
  }
  if (isUniqueConstraintError(err)) {
    return {
      status: 409,
      body: { message: 'A row with that identity already exists', code: 'CONFLICT_UNIQUE' },
    };
  }
  if (isForeignKeyConstraintError(err)) {
    return {
      status: 409,
      body: { message: 'Operation rejected by a foreign key constraint', code: 'CONFLICT_FK' },
    };
  }
  // A CHECK rejection means the caller sent a value the schema's closed
  // vocabulary or non-negativity rules forbid — that's a bad request, not a
  // conflict, and the 400 tells the caller to fix the payload.
  if (isCheckConstraintError(err)) {
    return {
      status: 400,
      body: { message: 'Operation rejected by a check constraint', code: 'CONSTRAINT_CHECK' },
    };
  }
  return null;
}
