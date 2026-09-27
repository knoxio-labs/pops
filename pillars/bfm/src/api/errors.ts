import { defineErrors } from '@pops/pillar-express';
import { getRequestId, mintRequestId } from '@pops/pillar-sdk/server';

import type { ErrorBody } from '@pops/types';

const BFM_ERROR_DEFINITIONS = {
  invalid_token: {
    area: 'auth',
    status: 401,
    message: 'Missing or invalid access token.',
    retryable: false,
  },
  operator_unauthorized: {
    area: 'auth',
    status: 401,
    message: 'This endpoint requires an operator session.',
    retryable: false,
  },
  device_revoked: {
    area: 'auth',
    status: 403,
    message: 'This device has been revoked. Pair again.',
    retryable: false,
  },
  contract_mismatch: {
    area: 'upstream',
    status: 502,
    message: 'An upstream service returned an incompatible response.',
    retryable: false,
  },
  misconfigured: {
    area: 'upstream',
    status: 502,
    message: 'An upstream service is not configured for this request.',
    retryable: false,
  },
  invalid: {
    area: 'request',
    status: 400,
    message: 'This request does not match what the server accepts.',
    retryable: false,
  },
  rate_limited: {
    area: 'request',
    status: 429,
    message: 'Too many pairing codes requested. Try again shortly.',
    retryable: true,
  },
  not_found: {
    area: 'resource',
    status: 404,
    message: 'The requested device was not found.',
    retryable: false,
  },
} as const;

export type BfmErrorReason = keyof typeof BFM_ERROR_DEFINITIONS;

/** Typed throwing helpers for BFM-owned ADR-054 error codes. */
export const bfmErrors = defineErrors('bfm', BFM_ERROR_DEFINITIONS);

/** Build a BFM-owned ADR-054 envelope for a declared contract response. */
export function bfmErrorBody(
  reason: 'invalid_token',
  options?: { readonly details?: unknown; readonly requestId?: string }
): ErrorBody & { readonly code: 'bfm.auth.invalid_token' };
export function bfmErrorBody(
  reason: 'operator_unauthorized',
  options?: { readonly details?: unknown; readonly requestId?: string }
): ErrorBody & { readonly code: 'bfm.auth.operator_unauthorized' };
export function bfmErrorBody(
  reason: 'device_revoked',
  options?: { readonly details?: unknown; readonly requestId?: string }
): ErrorBody & { readonly code: 'bfm.auth.device_revoked' };
export function bfmErrorBody(
  reason: 'contract_mismatch',
  options?: { readonly details?: unknown; readonly requestId?: string }
): ErrorBody & { readonly code: 'bfm.upstream.contract_mismatch' };
export function bfmErrorBody(
  reason: 'misconfigured',
  options?: { readonly details?: unknown; readonly requestId?: string }
): ErrorBody & { readonly code: 'bfm.upstream.misconfigured' };
export function bfmErrorBody(
  reason: 'invalid',
  options?: { readonly details?: unknown; readonly requestId?: string }
): ErrorBody & { readonly code: 'bfm.request.invalid' };
export function bfmErrorBody(
  reason: 'rate_limited',
  options?: { readonly details?: unknown; readonly requestId?: string }
): ErrorBody & { readonly code: 'bfm.request.rate_limited' };
export function bfmErrorBody(
  reason: 'not_found',
  options?: { readonly details?: unknown; readonly requestId?: string }
): ErrorBody & { readonly code: 'bfm.resource.not_found' };
export function bfmErrorBody(
  reason: BfmErrorReason,
  options: { readonly details?: unknown; readonly requestId?: string } = {}
): ErrorBody {
  const definition = BFM_ERROR_DEFINITIONS[reason];
  return {
    code: `bfm.${definition.area}.${reason}`,
    message: definition.message,
    requestId: options.requestId ?? getRequestId() ?? mintRequestId(),
    retryable: definition.retryable,
    ...(options.details === undefined ? {} : { details: options.details }),
  };
}

/** Build the registered malformed-request envelope used before ts-rest handlers run. */
export function invalidRequestBody(): ErrorBody & { readonly code: 'bfm.request.invalid' } {
  return bfmErrorBody('invalid');
}
