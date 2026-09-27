import { describe, expect, it } from 'vitest';

import {
  toCollectionUpstreamErrorResponse,
  toPurchaseUpdateErrorResponse,
  toReceiptBytesErrorResponse,
  toUpstreamErrorResponse,
} from '../upstream-error.js';

describe('BFM-owned upstream failures', () => {
  it('maps an unreachable producer to the shared gateway envelope', () => {
    const mapped = toUpstreamErrorResponse({
      kind: 'unavailable',
      pillar: 'finance',
      status: 503,
    });

    expect(mapped).toEqual({
      status: 503,
      body: {
        code: 'gateway.upstream_unavailable',
        message: 'The upstream service is unavailable.',
        requestId: expect.any(String),
        retryable: true,
        details: { upstream: { pillar: 'finance', status: 503 } },
      },
    });
  });

  it('uses the registered contract-mismatch code without leaking SDK diagnostics', () => {
    const mapped = toUpstreamErrorResponse({
      kind: 'contract-mismatch',
      pillar: 'finance',
      status: 502,
      detail: 'expected 1.4.0, got 2.0.0',
    });

    expect(mapped.body).toMatchObject({
      code: 'bfm.upstream.contract_mismatch',
      retryable: false,
      details: { upstream: { pillar: 'finance', status: 502 } },
    });
    expect(mapped.body.message).not.toContain('1.4.0');
  });

  it('uses the registered misconfiguration code for a legacy credential refusal', () => {
    const mapped = toUpstreamErrorResponse({
      kind: 'gateway-misconfigured',
      pillar: 'purchases',
      status: 502,
      upstreamStatus: 401,
    });

    expect(mapped.body).toMatchObject({
      code: 'bfm.upstream.misconfigured',
      details: { upstream: { pillar: 'purchases', status: 401 } },
    });
  });
});

describe('producer envelopes', () => {
  it('preserves code, message, retryability, and request id while adding relay details', () => {
    const mapped = toPurchaseUpdateErrorResponse({
      kind: 'conflict',
      pillar: 'purchases',
      status: 409,
      upstreamStatus: 409,
      code: 'purchases.purchase.stale',
      message: 'This purchase changed after it was loaded.',
      requestId: 'producer-request-4883',
      retryable: true,
      details: { version: 7 },
    });

    expect(mapped).toEqual({
      status: 409,
      body: {
        code: 'purchases.purchase.stale',
        message: 'This purchase changed after it was loaded.',
        requestId: 'producer-request-4883',
        retryable: true,
        details: {
          version: 7,
          upstream: { pillar: 'purchases', status: 409 },
        },
      },
    });
  });

  it('preserves a producer refusal even when BFM maps its status for the mobile route', () => {
    const mapped = toUpstreamErrorResponse({
      kind: 'invalid-request',
      pillar: 'purchases',
      status: 400,
      upstreamStatus: 422,
      code: 'purchases.receipt.inconsistent_total',
      message: 'The purchase totals are inconsistent.',
      requestId: 'producer-request-422',
      retryable: false,
    });

    expect(mapped.status).toBe(502);
    expect(mapped.body).toMatchObject({
      code: 'purchases.receipt.inconsistent_total',
      message: 'The purchase totals are inconsistent.',
      requestId: 'producer-request-422',
      retryable: false,
      details: { upstream: { pillar: 'purchases', status: 422 } },
    });
  });

  it('preserves an unsupported-media producer envelope on the route that declares 415', () => {
    const mapped = toReceiptBytesErrorResponse({
      kind: 'unsupported-media',
      pillar: 'purchases',
      status: 415,
      upstreamStatus: 415,
      code: 'purchases.receipt.not_an_image',
      message: 'This receipt is not an image and has no thumbnail.',
      requestId: 'producer-request-415',
      retryable: false,
    });

    expect(mapped.status).toBe(415);
    expect(mapped.body.code).toBe('purchases.receipt.not_an_image');
  });
});

describe('route status bounds', () => {
  it('folds a collection 404 to the declared 502 without discarding its envelope', () => {
    const mapped = toCollectionUpstreamErrorResponse({
      kind: 'not-found',
      pillar: 'finance',
      status: 404,
      upstreamStatus: 404,
      code: 'finance.account.not_found',
      message: 'The account was not found.',
      requestId: 'producer-request-404',
      retryable: false,
    });

    expect(mapped.status).toBe(502);
    expect(mapped.body).toMatchObject({
      code: 'finance.account.not_found',
      requestId: 'producer-request-404',
      details: { upstream: { pillar: 'finance', status: 404 } },
    });
  });
});
