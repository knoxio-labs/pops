import { getRequestId, mintRequestId } from '@pops/pillar-sdk/server';

import { bfmErrorBody } from '../errors.js';

import type { MobileUpstreamError } from '../../contract/rest-schemas.js';
import type { GatewayFailure } from '../pillars/gateway.js';

/** The statuses mobile resource routes declare for an upstream failure. */
export type UpstreamErrorStatus = 404 | 502 | 503;

type ClassifiedStatus = UpstreamErrorStatus | 415;

export interface UpstreamErrorResponse {
  readonly status: UpstreamErrorStatus;
  readonly body: MobileUpstreamError;
}

interface Classification {
  readonly status: ClassifiedStatus;
  readonly fallback: 'unavailable' | 'contract_mismatch' | 'misconfigured';
}

const GATEWAY_UPSTREAM_UNAVAILABLE_CODE = 'gateway.upstream_unavailable';

function classify(failure: GatewayFailure): Classification {
  switch (failure.kind) {
    case 'unavailable':
    case 'degraded':
      return { status: 503, fallback: 'unavailable' };
    case 'gateway-misconfigured':
      return { status: 502, fallback: 'misconfigured' };
    case 'not-found':
      return { status: 404, fallback: 'contract_mismatch' };
    case 'unsupported-media':
      return { status: 415, fallback: 'contract_mismatch' };
    case 'contract-mismatch':
    case 'invalid-request':
    case 'conflict':
    case 'protocol-too-old':
      return { status: 502, fallback: 'contract_mismatch' };
  }
}

type UpstreamDetails = Readonly<Record<string, unknown>> & {
  readonly upstream: { readonly pillar: string; readonly status: number };
};

function upstreamDetails(failure: GatewayFailure): UpstreamDetails {
  return {
    ...failure.details,
    upstream: {
      pillar: failure.pillar,
      status: failure.upstreamStatus ?? failure.status,
    },
  };
}

function fallbackBody(
  fallback: Classification['fallback'],
  failure: GatewayFailure
): MobileUpstreamError {
  const details = upstreamDetails(failure);
  if (fallback === 'unavailable') {
    return {
      code: GATEWAY_UPSTREAM_UNAVAILABLE_CODE,
      message: 'The upstream service is unavailable.',
      requestId: getRequestId() ?? mintRequestId(),
      retryable: true,
      details,
    };
  }
  const envelope =
    fallback === 'contract_mismatch'
      ? bfmErrorBody('contract_mismatch')
      : bfmErrorBody('misconfigured');
  return { ...envelope, details };
}

function relayBody(
  failure: GatewayFailure,
  fallback: Classification['fallback']
): MobileUpstreamError {
  if (failure.code === undefined) return fallbackBody(fallback, failure);
  const fallbackEnvelope = fallbackBody(fallback, failure);
  return {
    code: failure.code,
    message: failure.message ?? fallbackEnvelope.message,
    requestId: failure.requestId ?? fallbackEnvelope.requestId,
    retryable: failure.retryable ?? fallbackEnvelope.retryable,
    details: upstreamDetails(failure),
  };
}

function contractFault(failure: GatewayFailure): UpstreamErrorResponse {
  return {
    status: 502,
    body: relayBody(failure, 'contract_mismatch'),
  };
}

/** Map a gateway failure for a mobile route that addresses one resource. */
export function toUpstreamErrorResponse(failure: GatewayFailure): UpstreamErrorResponse {
  const classified = classify(failure);
  if (classified.status === 415) return contractFault(failure);
  return {
    status: classified.status,
    body: relayBody(failure, classified.fallback),
  };
}

/** The statuses a route that fetches stored bytes declares for an upstream failure. */
export type ReceiptBytesErrorStatus = UpstreamErrorStatus | 415;

export interface ReceiptBytesErrorResponse {
  readonly status: ReceiptBytesErrorStatus;
  readonly body: MobileUpstreamError;
}

/** Map a gateway failure for a route that requests a specific representation. */
export function toReceiptBytesErrorResponse(failure: GatewayFailure): ReceiptBytesErrorResponse {
  const classified = classify(failure);
  if (classified.status !== 415) return toUpstreamErrorResponse(failure);
  return {
    status: 415,
    body: relayBody(failure, classified.fallback),
  };
}

/** The statuses `PATCH /mobile/purchases/:id` declares for an upstream failure. */
export type PurchaseUpdateErrorStatus = UpstreamErrorStatus | 409;

export interface PurchaseUpdateErrorResponse {
  readonly status: PurchaseUpdateErrorStatus;
  readonly body: MobileUpstreamError;
}

/** Preserve a producer conflict on the purchase update route. */
export function toPurchaseUpdateErrorResponse(
  failure: GatewayFailure
): PurchaseUpdateErrorResponse {
  if (failure.kind === 'conflict') {
    return {
      status: 409,
      body: relayBody(failure, 'contract_mismatch'),
    };
  }
  return toUpstreamErrorResponse(failure);
}

/** The statuses `POST /mobile/ego/action-batches/:batchId/decide` can answer. */
export type EgoDecisionErrorStatus = UpstreamErrorStatus | 409;

export interface EgoDecisionErrorResponse {
  readonly status: EgoDecisionErrorStatus;
  readonly body: MobileUpstreamError;
}

/** Preserve a producer conflict for a mobile Ego batch decision. */
export function toEgoDecisionErrorResponse(failure: GatewayFailure): EgoDecisionErrorResponse {
  if (failure.kind === 'conflict') {
    return { status: 409, body: relayBody(failure, 'contract_mismatch') };
  }
  return toUpstreamErrorResponse(failure);
}

/** The subset a collection route can answer; a collection has no resource-level 404. */
export type CollectionUpstreamErrorStatus = Exclude<UpstreamErrorStatus, 404>;

export interface CollectionUpstreamErrorResponse {
  readonly status: CollectionUpstreamErrorStatus;
  readonly body: MobileUpstreamError;
}

/** Map a gateway failure for a collection route, folding an upstream 404 to 502. */
export function toCollectionUpstreamErrorResponse(
  failure: GatewayFailure
): CollectionUpstreamErrorResponse {
  if (failure.kind === 'not-found') {
    return { status: 502, body: contractFault(failure).body };
  }
  const mapped = toUpstreamErrorResponse(failure);
  if (mapped.status === 404) {
    return { status: 502, body: contractFault(failure).body };
  }
  if (mapped.status === 502) return { status: 502, body: mapped.body };
  return { status: 503, body: mapped.body };
}
