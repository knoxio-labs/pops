/**
 * Map purchases service errors to ts-rest response envelopes. Anything
 * unrecognised is re-thrown so Express's error pipeline (and the test
 * suite) sees the underlying stack rather than a swallowed 500.
 */
import { RequestValidationError } from '@ts-rest/express';

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
import {
  isCheckConstraintError,
  isForeignKeyConstraintError,
  isUniqueConstraintError,
} from '../shared/sqlite-errors.js';

import type { NextFunction, Response } from 'express';

export interface ErrorBody {
  message: string;
  code?: string;
}

/**
 * What a route declaring a 400 promises the body looks like when the request
 * never reached a handler. Same shape a handler-mapped 400 produces, so the
 * two ways to be rejected are indistinguishable on the wire.
 */
const VALIDATION_ERROR_BODY: ErrorBody = {
  message: 'Request does not match the contract schema',
  code: 'VALIDATION_ERROR',
};

/**
 * ts-rest rejects a request that does not match a route's `body`, `query` or
 * `params` schema **before** any handler runs, and answers with a body of its
 * own — `{ name: 'ValidationError', issues: [...] }`. Every route here that
 * declares a 400 declares {@link ErrorBody}, so without this the OpenAPI
 * document promises one shape and the server sends another, and a client
 * generated from that document cannot decode the rejection it is most likely
 * to see.
 *
 * Ordinary input reaches it: a search filter naming a field outside the closed
 * vocabulary, a `limit` that is not a number, an `orderedAt` that is not a
 * timestamp. Mirrors `pillars/finance/src/api/rest/error-mapping.ts`.
 *
 * The issues are dropped rather than forwarded: they name this server's
 * internal schema fields, and a caller that needs to know which filter was
 * refused gets that from the handler's own 400, which names it.
 */
export function createRequestValidationErrorHandler() {
  return (error: unknown, _req: unknown, res: Response, next: NextFunction): void => {
    if (!(error instanceof RequestValidationError)) {
      next(error);
      return;
    }
    res.status(400).json(VALIDATION_ERROR_BODY);
  };
}

export interface MappedHttpError {
  status: 400 | 404 | 409 | 502;
  body: ErrorBody;
}

interface ErrorMapping {
  readonly test: (err: unknown) => boolean;
  readonly status: MappedHttpError['status'];
  readonly code: string;
}

/**
 * Domain errors this pillar's service layer raises, each matched to the
 * status and code a client acts on. A table rather than a chain of `if`s so
 * the classification stays one line per error, however many the service
 * layer grows.
 */
const ERROR_MAPPINGS: readonly ErrorMapping[] = [
  {
    test: (err) =>
      err instanceof PurchaseNotFoundError ||
      err instanceof PurchaseSourceNotFoundError ||
      err instanceof ProductDictionaryNotFoundError,
    status: 404,
    code: 'NOT_FOUND',
  },
  // Not a failure: an adapter re-ingesting a bundle it has already
  // processed lands here and treats the 409 as "already have it".
  { test: (err) => err instanceof DuplicatePurchaseError, status: 409, code: 'DUPLICATE_PURCHASE' },
  // A self-inconsistent payload is the caller's mistake. Returning 500
  // would leave an adapter unable to distinguish a bad payload from a
  // broken pillar, and reasonably retrying forever.
  {
    test: (err) => err instanceof InvalidIngestPayloadError,
    status: 400,
    code: 'INVALID_INGEST_PAYLOAD',
  },
  // The order already carries that document. A backfill re-run lands here
  // for everything it attached last time and treats it as a skip, exactly
  // as it treats the duplicate order above.
  {
    test: (err) => err instanceof DocumentAlreadyAttachedError,
    status: 409,
    code: 'DOCUMENT_ALREADY_ATTACHED',
  },
  // The proposal was already answered. Distinct from the ingest duplicate
  // above because the caller is a review surface, not an adapter: it should
  // refresh and show the decision that already exists rather than skip.
  {
    test: (err) => err instanceof InventoryProposalConflictError,
    status: 409,
    code: 'PROPOSAL_ALREADY_DECIDED',
  },
  // Matched, part-matched, or unrecognised: merchant, date and total lock.
  { test: (err) => err instanceof PurchaseLockedError, status: 409, code: 'purchase_locked' },
  // The caller's own read of `updatedAt` is behind the row's current one.
  { test: (err) => err instanceof PurchaseStaleError, status: 409, code: 'purchase_stale' },
  // Inventory could not be reached, or refused, before the edit committed.
  // Retryable: nothing here was written.
  {
    test: (err) => err instanceof InventoryLinkClearFailedError,
    status: 502,
    code: 'INVENTORY_UNAVAILABLE',
  },
];

function mapConstraintError(err: unknown): MappedHttpError | null {
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

export function tryMapServiceError(err: unknown): MappedHttpError | null {
  const mapping = ERROR_MAPPINGS.find((candidate) => candidate.test(err));
  if (mapping !== undefined) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: mapping.status, body: { message, code: mapping.code } };
  }
  return mapConstraintError(err);
}
