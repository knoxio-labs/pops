import { defineErrors, PopsError } from '@pops/pillar-express';
import { mintRequestId, REQUEST_ID_HEADER } from '@pops/pillar-sdk/server';

import type { Request, Response } from 'express';

import type { ErrorBody } from '@pops/types';

const inventoryErrorDefinitions = {
  name_required: {
    area: 'codes',
    status: 400,
    message: 'Name the item before asking for a code.',
    retryable: false,
  },
} as const;

/** Registered inventory failures with fixed user-safe messages. */
export const inventoryErrors = defineErrors('inventory', inventoryErrorDefinitions);

/** Build an inventory failure while preserving a domain-specific safe message. */
export function inventoryError(options: {
  readonly area: string;
  readonly reason: string;
  readonly status: number;
  readonly message: string;
  readonly retryable?: boolean;
  readonly details?: unknown;
}): PopsError {
  return new PopsError({
    code: `inventory.${options.area}.${options.reason}`,
    status: options.status,
    message: options.message,
    retryable: options.retryable ?? false,
    details: options.details,
  });
}

/** Send a registered inventory envelope from a raw byte route. */
export function sendInventoryError(request: Request, response: Response, error: PopsError): void {
  const existingRequestId = request.requestId ?? response.locals.requestId;
  const requestId =
    typeof existingRequestId === 'string' && existingRequestId.length > 0
      ? existingRequestId
      : mintRequestId();
  request.requestId = requestId;
  response.locals.requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);
  const body: ErrorBody = {
    code: error.code,
    message: error.message,
    requestId,
    retryable: error.retryable,
    ...(error.details === undefined ? {} : { details: error.details }),
  };
  response.status(error.status).json(body);
}
