/**
 * The gateway-failure → HTTP mapping as a table.
 *
 * `gateway.test.ts` proves the SDK's failures stay seven distinct kinds inside
 * bfm. This file proves they are still seven distinct answers by the time they
 * reach a phone — the place the distinction was always most likely to be lost,
 * because collapsing everything to "something went wrong, 500" is the shape of
 * every error handler ever written in a hurry.
 */
import { describe, expect, it } from 'vitest';

import { toCollectionUpstreamErrorResponse, toUpstreamErrorResponse } from '../upstream-error.js';

import type { GatewayFailure } from '../../pillars/gateway.js';

const everyFailure: readonly GatewayFailure[] = [
  { kind: 'unavailable', pillar: 'finance', status: 503 },
  { kind: 'degraded', pillar: 'finance', reason: 'reconciling', status: 503 },
  { kind: 'contract-mismatch', pillar: 'finance', status: 502 },
  { kind: 'gateway-misconfigured', pillar: 'finance', status: 502 },
  { kind: 'invalid-request', pillar: 'finance', status: 400 },
  { kind: 'conflict', pillar: 'finance', status: 409 },
  { kind: 'not-found', pillar: 'finance', status: 404 },
];

describe('every gateway failure kind', () => {
  it('gets its own code, so none is folded into another on the way out', () => {
    const codes = everyFailure.map((failure) => toUpstreamErrorResponse(failure).body.code);

    expect(new Set(codes).size).toBe(everyFailure.length);
  });

  it('never answers 500', () => {
    for (const failure of everyFailure) {
      expect(toUpstreamErrorResponse(failure).status).not.toBe(500);
    }
  });

  it('names the pillar, so an operator reading a crash report knows which one', () => {
    for (const failure of everyFailure) {
      expect(toUpstreamErrorResponse(failure).body.pillar).toBe('finance');
    }
  });

  it('only ever answers a status the routes declare', () => {
    for (const failure of everyFailure) {
      expect([404, 502, 503]).toContain(toUpstreamErrorResponse(failure).status);
    }
  });
});

describe('retryability', () => {
  it('is true for the two "try again" signals and false for everything else', () => {
    const retryable = everyFailure
      .filter((failure) => toUpstreamErrorResponse(failure).body.retryable)
      .map((failure) => failure.kind);

    expect(retryable.toSorted()).toEqual(['degraded', 'unavailable']);
  });

  it('always agrees with the status the phone sees', () => {
    for (const failure of everyFailure) {
      const { status, body } = toUpstreamErrorResponse(failure);
      expect(body.retryable).toBe(status === 503);
    }
  });
});

describe('the mappings that are not the obvious one', () => {
  it("does not pass a sibling's 400 through as the app's fault", () => {
    // Finance rejecting a query bfm built is bfm's bug. A 400 would tell the
    // phone to stop asking for something it asked for perfectly correctly.
    const mapped = toUpstreamErrorResponse({
      kind: 'invalid-request',
      pillar: 'finance',
      status: 400,
    });

    expect(mapped.status).toBe(502);
    expect(mapped.body.code).toBe('upstream_invalid_request');
  });

  it('keeps "did not answer" and "uncallable contract" on different statuses', () => {
    const down = toUpstreamErrorResponse({ kind: 'unavailable', pillar: 'finance', status: 503 });
    const broken = toUpstreamErrorResponse({
      kind: 'contract-mismatch',
      pillar: 'finance',
      status: 502,
    });

    expect(down.status).not.toBe(broken.status);
    expect(down.body.retryable).not.toBe(broken.body.retryable);
  });
});

/**
 * A list has nothing to be "not found", and its route does not declare 404.
 * Emitting one anyway would put a status on the wire that the OpenAPI document
 * does not carry — so the generated Swift client would have no case for it and
 * the app would meet an undecodable response on a handset.
 */
describe('a collection route', () => {
  it('never answers a status its contract does not declare', () => {
    for (const failure of everyFailure) {
      expect([502, 503]).toContain(toCollectionUpstreamErrorResponse(failure).status);
    }
  });

  it('folds an upstream 404 into the contract fault it actually is', () => {
    const mapped = toCollectionUpstreamErrorResponse({
      kind: 'not-found',
      pillar: 'finance',
      status: 404,
    });

    expect(mapped.status).toBe(502);
    expect(mapped.body.code).toBe('upstream_contract_mismatch');
    expect(mapped.body.retryable).toBe(false);
    expect(mapped.body.message).toContain('collection');
  });

  it('leaves every other failure exactly as the resource route maps it', () => {
    for (const failure of everyFailure.filter((f) => f.kind !== 'not-found')) {
      expect(toCollectionUpstreamErrorResponse(failure)).toEqual(toUpstreamErrorResponse(failure));
    }
  });

  it('keeps the gateway detail through the fold, where it matters most', () => {
    // A 404 on a collection usually means a base URL pointing somewhere
    // unexpected, and the detail is the only thing that says where. Losing it
    // exactly here would blind the case it was carried for.
    const mapped = toCollectionUpstreamErrorResponse({
      kind: 'not-found',
      pillar: 'finance',
      status: 404,
      detail: 'no route matched GET /transactions',
    });

    expect(mapped.body.message).toContain('no route matched GET /transactions');
  });

  it('still separates an outage from a contract fault after the fold', () => {
    const down = toCollectionUpstreamErrorResponse({
      kind: 'unavailable',
      pillar: 'finance',
      status: 503,
    });
    const missing = toCollectionUpstreamErrorResponse({
      kind: 'not-found',
      pillar: 'finance',
      status: 404,
    });

    expect(down.status).not.toBe(missing.status);
    expect(down.body.retryable).not.toBe(missing.body.retryable);
  });
});

/**
 * The end-to-end regression for POPS-2230: what the phone actually sees for
 * a producer's real, permanent refusal (bfm's `GatewayFailure` for the SDK's
 * `refused` kind — see `gateway.ts`'s `toGatewayFailure`) versus a genuine
 * outage. Before the fix both answered `503 upstream_unavailable,
 * retryable: true`; a caller could not tell "purchases said no, permanently"
 * from "nobody answered".
 */
describe('a producer refusal reaching the phone', () => {
  it('is retryable:false and a different status than a genuine outage', () => {
    const refused = toUpstreamErrorResponse({
      kind: 'invalid-request',
      pillar: 'purchases',
      status: 400,
      detail: 'upstream answered 413: request entity too large',
    });
    const down = toUpstreamErrorResponse({ kind: 'unavailable', pillar: 'purchases', status: 503 });

    expect(refused.status).not.toBe(down.status);
    expect(refused.body.retryable).toBe(false);
    expect(down.body.retryable).toBe(true);
  });

  it('the real upstream status and message reach the phone through the detail', () => {
    const refused = toUpstreamErrorResponse({
      kind: 'invalid-request',
      pillar: 'purchases',
      status: 400,
      detail: 'upstream answered 413: request entity too large',
    });

    expect(refused.body.message).toContain('413');
    expect(refused.body.message).toContain('request entity too large');
  });
});

describe('the operator detail', () => {
  it('is appended when the gateway carries one', () => {
    const mapped = toUpstreamErrorResponse({
      kind: 'contract-mismatch',
      pillar: 'finance',
      status: 502,
      detail: 'expected 1.4.0, got 2.0.0',
    });

    expect(mapped.body.message).toContain('expected 1.4.0, got 2.0.0');
  });

  it('leaves a readable message when there is none', () => {
    const mapped = toUpstreamErrorResponse({ kind: 'unavailable', pillar: 'finance', status: 503 });

    expect(mapped.body.message).toBe('finance did not answer');
  });
});
