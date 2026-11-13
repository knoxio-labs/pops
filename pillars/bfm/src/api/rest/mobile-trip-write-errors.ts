import { relayBody, toConflictRelayErrorResponse } from './upstream-error.js';

import type { MobileUpstreamError } from '../../contract/rest-schemas.js';
import type { GatewayFailure } from '../pillars/gateway.js';

/** Retains producer validation/conflict status, while missing resources and unavailable peers remain distinct. */
export function toTripWriteErrorResponse(outcome: GatewayFailure): {
  status: 400 | 404 | 409 | 502 | 503;
  body: MobileUpstreamError;
} {
  return outcome.kind === 'invalid-request'
    ? { status: 400, body: relayBody(outcome, 'contract_mismatch') }
    : toConflictRelayErrorResponse(outcome);
}
