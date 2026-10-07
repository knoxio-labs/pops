import { relayBody, toUpstreamErrorResponse, type UpstreamErrorStatus } from './upstream-error.js';

import type {
  MobileFinanceForbiddenError,
  MobileFinanceRequestError,
} from '../../contract/mobile-finance-write-schemas.js';
import type { MobileUpstreamError } from '../../contract/rest-schemas.js';
import type { GatewayFailure } from '../pillars/gateway.js';

const FINANCE_FORBIDDEN_CODE = 'finance.resource.forbidden';

/** What a `/mobile/finance` write answers when finance did not carry it out. */
export type FinanceWriteErrorResponse =
  | { readonly status: 400; readonly body: MobileFinanceRequestError }
  | { readonly status: 403; readonly body: MobileFinanceForbiddenError }
  | { readonly status: UpstreamErrorStatus; readonly body: MobileUpstreamError };

/**
 * Map a gateway failure for a finance write, keeping finance's own refusals
 * under their own status.
 *
 * A request finance validated and refused is a `400` with finance's code and
 * message. A caller who may see the account and not write to it is a `403`.
 * Everything else is what a read answers: `404`, `502` or `503`.
 */
export function toFinanceWriteErrorResponse(failure: GatewayFailure): FinanceWriteErrorResponse {
  if (failure.kind === 'invalid-request') {
    return { status: 400, body: relayBody(failure, 'contract_mismatch') };
  }
  if (failure.kind === 'forbidden' && failure.code === FINANCE_FORBIDDEN_CODE) {
    return {
      status: 403,
      body: { ...relayBody(failure, 'misconfigured'), code: FINANCE_FORBIDDEN_CODE },
    };
  }
  return toUpstreamErrorResponse(failure);
}
