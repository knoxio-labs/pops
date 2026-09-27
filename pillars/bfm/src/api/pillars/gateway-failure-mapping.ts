import type { CallFailure } from '@pops/pillar-sdk/server';

import type { GatewayFailure } from './gateway-types.js';

/** Translate an SDK failure into the BFM mobile gateway vocabulary. */
export function toGatewayFailure(failure: CallFailure): GatewayFailure {
  const target = failure.pillar;
  switch (failure.kind) {
    case 'unavailable':
      return mapUnavailable(failure, target);
    case 'degraded':
      return { kind: 'degraded', pillar: target, reason: failure.reason, status: 503 };
    case 'contract-mismatch':
      return mapContractMismatch(failure, target);
    case 'not-found':
      return mapNotFound(failure, target);
    case 'conflict':
      return mapConflict(failure, target);
    case 'bad-request':
      return mapBadRequest(failure, target);
    case 'refused':
      return mapRefused(failure, target);
    case 'rate-limited':
      return mapRateLimited(failure, target);
    case 'unauthorized':
      return mapUnauthorized(failure, target);
  }
}

function mapUnavailable(
  failure: Extract<CallFailure, { kind: 'unavailable' }>,
  target: string
): GatewayFailure {
  return {
    kind: 'unavailable',
    pillar: target,
    status: 503,
    upstreamStatus: 503,
    ...producerEnvelopeFields(failure),
  };
}

function mapContractMismatch(
  failure: Extract<CallFailure, { kind: 'contract-mismatch' }>,
  target: string
): GatewayFailure {
  return {
    kind: 'contract-mismatch',
    pillar: target,
    status: 502,
    detail: describeMismatch(failure),
  };
}

function mapNotFound(
  failure: Extract<CallFailure, { kind: 'not-found' }>,
  target: string
): GatewayFailure {
  return {
    kind: 'not-found',
    pillar: target,
    status: 404,
    upstreamStatus: 404,
    ...producerEnvelopeFields(failure),
  };
}

function mapConflict(
  failure: Extract<CallFailure, { kind: 'conflict' }>,
  target: string
): GatewayFailure {
  return {
    kind: 'conflict',
    pillar: target,
    status: 409,
    upstreamStatus: 409,
    ...producerEnvelopeFields(failure),
  };
}

function mapBadRequest(
  failure: Extract<CallFailure, { kind: 'bad-request' }>,
  target: string
): GatewayFailure {
  return {
    kind: 'invalid-request',
    pillar: target,
    status: 400,
    upstreamStatus: 400,
    ...producerEnvelopeFields(failure),
  };
}

function mapRateLimited(
  failure: Extract<CallFailure, { kind: 'rate-limited' }>,
  target: string
): GatewayFailure {
  return {
    kind: 'unavailable',
    pillar: target,
    status: 503,
    upstreamStatus: 429,
    detail: withRetryAfter(failure.retryAfterSeconds, failure.message),
    ...producerEnvelopeFields(failure),
  };
}

function mapUnauthorized(
  failure: Extract<CallFailure, { kind: 'unauthorized' }>,
  target: string
): GatewayFailure {
  return {
    kind: 'gateway-misconfigured',
    pillar: target,
    status: 502,
    upstreamStatus: 401,
    ...producerEnvelopeFields(failure),
  };
}

function mapRefused(
  failure: Extract<CallFailure, { kind: 'refused' }>,
  target: string
): GatewayFailure {
  if (failure.status === 415) {
    return {
      kind: 'unsupported-media',
      pillar: target,
      status: 415,
      upstreamStatus: failure.status,
      detail: withUpstreamStatus(failure.status, failure.message),
      ...producerEnvelopeFields(failure),
    };
  }
  if (failure.status === 426) {
    return {
      kind: 'protocol-too-old',
      pillar: target,
      status: 426,
      upstreamStatus: failure.status,
      detail: withUpstreamStatus(failure.status, failure.message),
      ...producerEnvelopeFields(failure),
    };
  }
  return {
    kind: 'invalid-request',
    pillar: target,
    status: 400,
    upstreamStatus: failure.status,
    detail: withUpstreamStatus(failure.status, failure.message),
    ...producerEnvelopeFields(failure),
  };
}

function producerEnvelopeFields(failure: CallFailure): {
  readonly code?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly message?: string;
  readonly requestId?: string;
  readonly retryable?: boolean;
} {
  if (failure.kind === 'degraded' || failure.kind === 'contract-mismatch') return {};
  return {
    ...(failure.code === undefined ? {} : { code: failure.code }),
    ...(failure.details === undefined ? {} : { details: failure.details }),
    ...(failure.message === undefined ? {} : { message: failure.message }),
    ...(failure.requestId === undefined ? {} : { requestId: failure.requestId }),
    ...(failure.retryable === undefined ? {} : { retryable: failure.retryable }),
  };
}

function describeMismatch(failure: Extract<CallFailure, { kind: 'contract-mismatch' }>): string {
  if (failure.message !== undefined) return failure.message;
  return `expected ${failure.expected ?? 'unknown'}, got ${failure.actual ?? 'unknown'}`;
}

function withUpstreamStatus(status: number, message: string | undefined): string {
  const base = `upstream answered ${String(status)}`;
  return message === undefined ? base : `${base}: ${message}`;
}

function withRetryAfter(
  retryAfterSeconds: number | undefined,
  message: string | undefined
): string {
  const base =
    retryAfterSeconds === undefined
      ? 'rate limited'
      : `rate limited, retry after ${String(retryAfterSeconds)}s`;
  return message === undefined ? base : `${base}: ${message}`;
}
