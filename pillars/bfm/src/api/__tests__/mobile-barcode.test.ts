import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_DEVICE_CAPABILITIES,
  MOBILE_CAPABILITY_SCOPES,
  readRouteCapability,
  serialiseDeviceCapabilities,
  type MobileCapability,
} from '../../contract/capabilities.js';
import { bfmContract } from '../../contract/rest.js';
import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { BARCODE_PRODUCT } from '../barcode/__tests__/fixture.js';
import { createTestApp, type TestApp } from './harness.js';
import { requestOn } from './test-http.js';

import type { Express } from 'express';

import type { MobileBarcodeLookupOutcome } from '../../contract/rest-mobile-barcode.js';
import type { MobileBarcodeClient } from '../barcode/client.js';
import type { GatewayFailure, GatewayOutcome } from '../pillars/gateway.js';
import type { MobileBarcodeRelayLogger } from '../rest/mobile-barcode-handlers.js';

const apps: TestApp[] = [];

afterEach(() => {
  while (apps.length > 0) apps.pop()?.cleanup();
});

function openWith(
  barcode: MobileBarcodeClient,
  capabilities: readonly MobileCapability[] = DEFAULT_DEVICE_CAPABILITIES,
  barcodeLogger?: MobileBarcodeRelayLogger
): { app: Express; token: string; deviceId: string } {
  const created = createTestApp({
    barcode,
    ...(barcodeLogger === undefined ? {} : { barcodeLogger }),
  });
  apps.push(created);

  const row = deviceRow({
    capabilities: serialiseDeviceCapabilities(capabilities),
    capabilityMode: 'explicit',
  });
  created.db.insert(devices).values(row).run();
  const { token } = mintAccessToken(row.id, created.accessTokenSigningKey);

  return { app: created.app, token, deviceId: row.id };
}

function barcodeClient(outcome: GatewayOutcome<MobileBarcodeLookupOutcome>): MobileBarcodeClient {
  return { lookup: () => Promise.resolve(outcome) };
}

function lookup(app: Express, token: string, code = '9780330423304', diagnostics = false) {
  return requestOn(app, (r) => {
    const request = r
      .get(`/mobile/barcode/lookup/${code}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', 'bfm-barcode-5050');
    return diagnostics ? request.set('X-Pops-Barcode-Diagnostics', '1') : request;
  });
}

describe('GET /mobile/barcode/lookup/:code', () => {
  it('passes through a found product', async () => {
    const { app, token } = openWith(
      barcodeClient({ kind: 'ok', value: { outcome: 'found', product: BARCODE_PRODUCT } })
    );

    const response = await lookup(app, token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ outcome: 'found', product: BARCODE_PRODUCT });
  });

  it('passes through a not-found result', async () => {
    const { app, token } = openWith(barcodeClient({ kind: 'ok', value: { outcome: 'not_found' } }));

    const response = await lookup(app, token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ outcome: 'not_found' });
  });

  it('does not impose barcode-format validation in bfm', async () => {
    const { app, token } = openWith(barcodeClient({ kind: 'ok', value: { outcome: 'not_found' } }));

    const response = await lookup(app, token, 'not-an-isbn');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ outcome: 'not_found' });
  });

  it('classifies gateway failures inside the compatible unavailable outcome', async () => {
    const failures: readonly { failure: GatewayFailure; code: string; retryable: boolean }[] = [
      {
        failure: { kind: 'unavailable', pillar: 'barcode', status: 503 },
        code: 'gateway.upstream_unavailable',
        retryable: true,
      },
      {
        failure: { kind: 'degraded', pillar: 'barcode', reason: 'reconciling', status: 503 },
        code: 'gateway.upstream_unavailable',
        retryable: true,
      },
      {
        failure: { kind: 'contract-mismatch', pillar: 'barcode', status: 502 },
        code: 'bfm.upstream.contract_mismatch',
        retryable: false,
      },
      {
        failure: { kind: 'not-found', pillar: 'barcode', status: 404 },
        code: 'bfm.upstream.contract_mismatch',
        retryable: false,
      },
      {
        failure: { kind: 'conflict', pillar: 'barcode', status: 409 },
        code: 'bfm.upstream.contract_mismatch',
        retryable: false,
      },
      {
        failure: { kind: 'invalid-request', pillar: 'barcode', status: 400 },
        code: 'bfm.upstream.contract_mismatch',
        retryable: false,
      },
      {
        failure: { kind: 'unsupported-media', pillar: 'barcode', status: 415 },
        code: 'bfm.upstream.contract_mismatch',
        retryable: false,
      },
      {
        failure: { kind: 'gateway-misconfigured', pillar: 'barcode', status: 502 },
        code: 'bfm.upstream.misconfigured',
        retryable: false,
      },
      {
        failure: { kind: 'protocol-too-old', pillar: 'barcode', status: 426 },
        code: 'bfm.upstream.contract_mismatch',
        retryable: false,
      },
    ];

    for (const { failure, code, retryable } of failures) {
      const { app, token } = openWith(barcodeClient(failure));
      const response = await lookup(app, token, undefined, true);

      expect(response.status, failure.kind).toBe(200);
      expect(response.body, failure.kind).toMatchObject({
        outcome: 'unavailable',
        error: {
          code,
          message: expect.any(String),
          requestId: 'bfm-barcode-5050',
          retryable,
        },
      });
    }
  });

  it('classifies a downstream 403 as server misconfiguration', async () => {
    const { app, token } = openWith(
      barcodeClient({
        kind: 'invalid-request',
        pillar: 'barcode',
        status: 400,
        upstreamStatus: 403,
      })
    );

    const response = await lookup(app, token, undefined, true);

    expect(response.body).toMatchObject({
      outcome: 'unavailable',
      error: { code: 'bfm.upstream.misconfigured', retryable: false },
    });
  });

  it('preserves malformed barcode validation as a non-retryable opt-in error', async () => {
    const { app, token } = openWith(
      barcodeClient({
        kind: 'invalid-request',
        pillar: 'barcode',
        status: 400,
        upstreamStatus: 400,
        code: 'barcode.lookup.invalid_code',
        message: 'The supplied barcode is invalid.',
        requestId: 'barcode-invalid-5050',
      })
    );

    const legacy = await lookup(app, token);
    const optedIn = await lookup(app, token, undefined, true);

    expect(legacy.body).toEqual({ outcome: 'unavailable' });
    expect(optedIn.body).toEqual({
      outcome: 'unavailable',
      error: {
        code: 'barcode.lookup.invalid_code',
        message: 'The supplied barcode is invalid.',
        requestId: 'barcode-invalid-5050',
        retryable: false,
      },
    });
  });

  it('maps a malformed client outcome to unavailable', async () => {
    const { app, token } = openWith(
      barcodeClient({ kind: 'contract-mismatch', pillar: 'barcode', status: 502 })
    );

    const response = await lookup(app, token, undefined, true);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      outcome: 'unavailable',
      error: { code: 'bfm.upstream.contract_mismatch', retryable: false },
    });
  });

  it('preserves producer diagnostics and logs both correlation ids when they differ', async () => {
    const info = vi.fn<MobileBarcodeRelayLogger['info']>();
    const producerError = {
      code: 'barcode.lookup.timeout',
      message: 'Barcode lookup timed out.',
      requestId: 'barcode-upstream-5050',
      retryable: true,
    };
    const { app, token } = openWith(
      barcodeClient({
        kind: 'ok',
        value: { outcome: 'unavailable', error: producerError },
      }),
      DEFAULT_DEVICE_CAPABILITIES,
      { info }
    );

    const response = await lookup(app, token, undefined, true);

    expect(response.body).toEqual({ outcome: 'unavailable', error: producerError });
    expect(info).toHaveBeenCalledWith(
      'bfm barcode relay outcome',
      expect.objectContaining({
        requestId: 'bfm-barcode-5050',
        upstreamRequestId: 'barcode-upstream-5050',
        outcome: 'unavailable',
        failureClass: 'barcode.lookup.timeout',
        retryable: true,
        durationMs: expect.any(Number),
      })
    );
  });

  it('keeps legacy union arms exact without the diagnostics header', async () => {
    const unavailableError = {
      code: 'barcode.lookup.provider_unavailable',
      message: 'Barcode lookup is temporarily unavailable.',
      requestId: 'barcode-request-5050',
      retryable: true,
    };
    const unavailable = openWith(
      barcodeClient({
        kind: 'ok',
        value: { outcome: 'unavailable', error: unavailableError },
      })
    );
    const unsupported = openWith(
      barcodeClient({ kind: 'ok', value: { outcome: 'not_found', reason: 'unsupported' } })
    );

    const unavailableResponse = await lookup(unavailable.app, unavailable.token);
    const unsupportedResponse = await lookup(unsupported.app, unsupported.token);

    expect(unavailableResponse.body).toEqual({ outcome: 'unavailable' });
    expect(unsupportedResponse.body).toEqual({ outcome: 'not_found' });
  });

  it('returns additive metadata to an opted-in client', async () => {
    const unavailableError = {
      code: 'barcode.lookup.provider_unavailable',
      message: 'Barcode lookup is temporarily unavailable.',
      requestId: 'barcode-request-5050',
      retryable: true,
    };
    const unavailable = openWith(
      barcodeClient({
        kind: 'ok',
        value: { outcome: 'unavailable', error: unavailableError },
      })
    );
    const unsupported = openWith(
      barcodeClient({ kind: 'ok', value: { outcome: 'not_found', reason: 'unsupported' } })
    );

    const unavailableResponse = await lookup(unavailable.app, unavailable.token, undefined, true);
    const unsupportedResponse = await lookup(unsupported.app, unsupported.token, undefined, true);

    expect(unavailableResponse.body).toEqual({ outcome: 'unavailable', error: unavailableError });
    expect(unsupportedResponse.body).toEqual({ outcome: 'not_found', reason: 'unsupported' });
  });

  it('requires barcode.read', async () => {
    const { app, token } = openWith(
      barcodeClient({ kind: 'ok', value: { outcome: 'not_found' } }),
      ['session.read']
    );

    const response = await lookup(app, token);

    expect(response.status).toBe(403);
  });

  it('logs barcode perimeter rejections without the raw barcode', async () => {
    const info = vi.fn<MobileBarcodeRelayLogger['info']>();
    const { app, token, deviceId } = openWith(
      barcodeClient({ kind: 'ok', value: { outcome: 'not_found' } }),
      ['session.read'],
      { info }
    );

    const unauthorized = await requestOn(app, (r) =>
      r.get('/mobile/barcode/lookup/9780330423304').set('X-Request-Id', 'barcode-unauthorized')
    );
    const forbidden = await lookup(app, token);

    expect(unauthorized.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(info).toHaveBeenCalledWith(
      'bfm barcode request rejected',
      expect.objectContaining({
        requestId: 'barcode-unauthorized',
        operation: 'mobileBarcode.lookup',
        status: 401,
        durationMs: expect.any(Number),
      })
    );
    expect(info).toHaveBeenCalledWith(
      'bfm barcode request rejected',
      expect.objectContaining({
        requestId: 'bfm-barcode-5050',
        operation: 'mobileBarcode.lookup',
        status: 403,
        durationMs: expect.any(Number),
        deviceId,
      })
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain('9780330423304');
  });
});

describe('barcode capability wiring', () => {
  it('declares the route metadata and its downstream scope', () => {
    expect(readRouteCapability(bfmContract.mobileBarcode.lookup.metadata)).toBe('barcode.read');
    expect(MOBILE_CAPABILITY_SCOPES['barcode.read']).toEqual(['barcode.lookup']);
  });

  it('adds barcode.read to the default grant used by paired devices', () => {
    expect(DEFAULT_DEVICE_CAPABILITIES).toContain('barcode.read');
  });
});
