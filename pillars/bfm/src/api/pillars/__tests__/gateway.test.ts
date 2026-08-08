/**
 * The gateway's translation table, driven through a stub handle.
 *
 * What is under test is the vocabulary, not the transport: that every SDK
 * failure kind lands on a distinct bfm outcome, and specifically that the
 * three federation-health signals stay three signals. The transport half —
 * that the call is authenticated at all — is
 * `service-account-header.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import {
  createPillarGateway,
  isGatewayOk,
  toGatewayFailure,
  type GatewayFailure,
  type PillarHandleFactory,
} from '../gateway.js';

import type { CallFailure, CallResult, PillarHandle } from '@pops/pillar-sdk/server';

type TransactionsRouter = {
  transactions: {
    list: (input: { limit: number }) => Promise<{ data: readonly { id: string }[] }>;
  };
};

/**
 * A handle that answers every call with `result`, and records how it was
 * asked for. Discovery and the network are replaced, not the proxy: this file
 * must fail when the MAPPING changes, not when discovery does.
 */
function stubHandle(result: CallResult<unknown>): {
  factory: PillarHandleFactory;
  requestedIds: string[];
} {
  const requestedIds: string[] = [];
  const routes = { transactions: { list: () => result } };
  const factory = <TRouter>(pillarId: string): PillarHandle<TRouter> => {
    requestedIds.push(pillarId);
    return fakePillarHandle<TRouter>(pillarId, routes);
  };
  return { factory, requestedIds };
}

function callWith(result: CallResult<unknown>) {
  const { factory, requestedIds } = stubHandle(result);
  const gateway = createPillarGateway(factory);
  return {
    requestedIds,
    outcome: gateway.call<TransactionsRouter, unknown>('finance', (handle) =>
      handle.transactions.list({ limit: 1 })
    ),
  };
}

describe('a call that succeeds', () => {
  it('carries the value through untouched', async () => {
    const value = { data: [{ id: 'txn-1' }] };

    const outcome = await callWith({ kind: 'ok', value }).outcome;

    expect(isGatewayOk(outcome)).toBe(true);
    if (!isGatewayOk(outcome)) return;
    expect(outcome.value).toBe(value);
  });

  it('asks the factory for the pillar the caller named', async () => {
    const { requestedIds, outcome } = callWith({ kind: 'ok', value: null });
    await outcome;

    expect(requestedIds).toEqual(['finance']);
  });
});

/**
 * The three federation-health signals. Collapsing any pair of these is the
 * regression the whole gateway exists to prevent: the moment bfm is worth
 * having is the moment the fleet is half-broken, and a caller that cannot
 * tell "nobody answered" from "answered, but with no contract we can call"
 * has nothing useful to render.
 */
describe('the federation-health signals stay distinct', () => {
  const unavailable = toGatewayFailure({ kind: 'unavailable', pillar: 'finance' });
  const degraded = toGatewayFailure({ kind: 'degraded', pillar: 'finance', reason: 'reconciling' });
  const mismatch = toGatewayFailure({
    kind: 'contract-mismatch',
    pillar: 'finance',
    message: 'pillar serves no /openapi contract',
  });

  it('maps each to its own kind', () => {
    expect([unavailable.kind, degraded.kind, mismatch.kind]).toEqual([
      'unavailable',
      'degraded',
      'contract-mismatch',
    ]);
  });

  it('separates "not answering" from "registered but uncallable" by status', () => {
    expect(unavailable.status).toBe(503);
    expect(mismatch.status).toBe(502);
    expect(unavailable.status).not.toBe(mismatch.status);
  });

  it('never produces a generic 500 for any of them', () => {
    for (const failure of [unavailable, degraded, mismatch]) {
      expect(failure.status).not.toBe(500);
    }
  });

  it('keeps degraded retryable alongside unavailable while staying a separate kind', () => {
    expect(degraded.status).toBe(503);
    expect(degraded.kind).not.toBe(unavailable.kind);
    if (degraded.kind !== 'degraded') throw new Error('degraded narrowed wrong');
    expect(degraded.reason).toBe('reconciling');
  });

  it('carries the producer detail on a mismatch so an operator can act on it', () => {
    expect(mismatch.detail).toBe('pillar serves no /openapi contract');
  });

  it('describes a version skew when the SDK reports no message', () => {
    const skew = toGatewayFailure({
      kind: 'contract-mismatch',
      pillar: 'finance',
      expected: '1.4.0',
      actual: '2.0.0',
    });

    expect(skew.detail).toBe('expected 1.4.0, got 2.0.0');
  });
});

describe('failures that are about the request, not the federation', () => {
  const cases: readonly [CallFailure, GatewayFailure['kind'], number][] = [
    [{ kind: 'not-found', pillar: 'finance' }, 'not-found', 404],
    [{ kind: 'conflict', pillar: 'finance' }, 'conflict', 409],
    [{ kind: 'bad-request', pillar: 'finance' }, 'invalid-request', 400],
  ];

  it.each(cases)('maps %o to its own outcome', (failure, kind, status) => {
    const mapped = toGatewayFailure(failure);

    expect(mapped.kind).toBe(kind);
    expect(mapped.status).toBe(status);
  });
});

/**
 * The one mapping that is not the obvious one. A sibling rejecting bfm's key
 * is bfm's problem, not the phone's — answering 401 would tell a phone whose
 * own credential is perfectly good to go and refresh it, forever.
 */
describe("a sibling rejecting this pillar's own key", () => {
  it('is a gateway misconfiguration, not an authentication failure', () => {
    const mapped = toGatewayFailure({ kind: 'unauthorized', pillar: 'finance' });

    expect(mapped.kind).toBe('gateway-misconfigured');
    expect(mapped.status).toBe(502);
    expect(mapped.status).not.toBe(401);
  });
});

describe('every SDK failure kind is mapped', () => {
  const everyKind: readonly CallFailure[] = [
    { kind: 'unavailable', pillar: 'finance' },
    { kind: 'degraded', pillar: 'finance', reason: 'reconciling' },
    { kind: 'contract-mismatch', pillar: 'finance' },
    { kind: 'not-found', pillar: 'finance' },
    { kind: 'conflict', pillar: 'finance' },
    { kind: 'bad-request', pillar: 'finance' },
    { kind: 'unauthorized', pillar: 'finance' },
  ];

  it('gives each one a distinct bfm kind, so none is silently folded into another', () => {
    const kinds = everyKind.map((failure) => toGatewayFailure(failure).kind);

    expect(new Set(kinds).size).toBe(everyKind.length);
  });

  it('names the pillar on every outcome', async () => {
    for (const failure of everyKind) {
      const outcome = await callWith(failure).outcome;
      expect(isGatewayOk(outcome)).toBe(false);
      if (isGatewayOk(outcome)) continue;
      expect(outcome.pillar).toBe('finance');
    }
  });
});
