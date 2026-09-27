/** Handlers for the mobile barcode lookup route. */
import { getRequestId, mintRequestId } from '@pops/pillar-sdk/server';

import { bfmErrorBody } from '../errors.js';
import { isGatewayOk } from '../pillars/gateway.js';
import { toUpstreamErrorResponse } from './upstream-error.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { ErrorBody } from '@pops/types';

import type { MobileBarcodeLookupOutcome } from '../../contract/rest-mobile-barcode.js';
import type { bfmContract } from '../../contract/rest.js';
import type { MobileBarcodeClient } from '../barcode/client.js';
import type { GatewayFailure } from '../pillars/gateway.js';

type Req = ServerInferRequest<typeof bfmContract>['mobileBarcode'];
const BARCODE_INVALID_CODE = 'barcode.lookup.invalid_code';

/** Structured logger for the mobile barcode relay. */
export interface MobileBarcodeRelayLogger {
  info(message: string, context: Readonly<Record<string, unknown>>): void;
}

/** Dependencies for the mobile barcode handler. */
export interface MobileBarcodeHandlerDeps {
  barcode: MobileBarcodeClient;
  barcodeLogger?: MobileBarcodeRelayLogger;
}

function currentRequestId(): string {
  return getRequestId() ?? mintRequestId();
}

function gatewayUnavailableError(failure: GatewayFailure): ErrorBody {
  if (failure.kind === 'invalid-request' && failure.code === BARCODE_INVALID_CODE) {
    return {
      code: BARCODE_INVALID_CODE,
      message: 'The supplied barcode is invalid.',
      requestId: failure.requestId ?? currentRequestId(),
      retryable: false,
    };
  }
  if (
    failure.kind === 'gateway-misconfigured' ||
    failure.upstreamStatus === 401 ||
    failure.upstreamStatus === 403
  ) {
    return bfmErrorBody('misconfigured');
  }
  if (failure.kind === 'contract-mismatch') return bfmErrorBody('contract_mismatch');
  if (failure.kind === 'unavailable' || failure.kind === 'degraded') {
    return toUpstreamErrorResponse(failure).body;
  }
  return bfmErrorBody('contract_mismatch');
}

function normaliseOutcome(outcome: MobileBarcodeLookupOutcome): MobileBarcodeLookupOutcome {
  if (outcome.outcome !== 'unavailable' || outcome.error !== undefined) return outcome;
  return {
    outcome: 'unavailable',
    error: toUpstreamErrorResponse({
      kind: 'unavailable',
      pillar: 'barcode',
      status: 503,
    }).body,
  };
}

function responseOutcome(
  outcome: MobileBarcodeLookupOutcome,
  diagnosticsRequested: boolean
): MobileBarcodeLookupOutcome {
  if (diagnosticsRequested || outcome.outcome === 'found') return outcome;
  return { outcome: outcome.outcome };
}

function logRelayOutcome(
  logger: MobileBarcodeRelayLogger | undefined,
  startedAt: number,
  outcome: MobileBarcodeLookupOutcome,
  failure?: GatewayFailure
): void {
  const context: Record<string, unknown> = {
    requestId: currentRequestId(),
    outcome: outcome.outcome,
    durationMs: Date.now() - startedAt,
  };
  if (outcome.outcome === 'found') context.source = outcome.product.source;
  if (outcome.outcome === 'not_found' && outcome.reason !== undefined) {
    context.reason = outcome.reason;
  }
  if (outcome.outcome === 'unavailable' && outcome.error !== undefined) {
    context.failureClass = outcome.error.code;
    context.retryable = outcome.error.retryable;
    if (outcome.error.requestId !== context.requestId) {
      context.upstreamRequestId = outcome.error.requestId;
    }
  }
  if (failure !== undefined) {
    context.downstreamKind = failure.kind;
    context.downstreamStatus = failure.upstreamStatus ?? failure.status;
  }
  logger?.info('bfm barcode relay outcome', context);
}

/** Build handlers for bfm's mobile barcode relay. */
export function makeMobileBarcodeHandlers(deps: MobileBarcodeHandlerDeps) {
  const logger = deps.barcodeLogger;
  return {
    lookup: async ({ params, headers }: Req['lookup']) => {
      const startedAt = Date.now();
      const outcome = await deps.barcode.lookup(params.code);
      if (!isGatewayOk(outcome)) {
        const body = { outcome: 'unavailable' as const, error: gatewayUnavailableError(outcome) };
        logRelayOutcome(logger, startedAt, body, outcome);
        return {
          status: 200 as const,
          body: responseOutcome(body, headers['x-pops-barcode-diagnostics'] === '1'),
        };
      }

      const body = normaliseOutcome(outcome.value);
      logRelayOutcome(logger, startedAt, body);
      return {
        status: 200 as const,
        body: responseOutcome(body, headers['x-pops-barcode-diagnostics'] === '1'),
      };
    },
  };
}
