import { afterEach, describe, expect, it } from 'vitest';

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

const apps: TestApp[] = [];

afterEach(() => {
  while (apps.length > 0) apps.pop()?.cleanup();
});

function openWith(
  barcode: MobileBarcodeClient,
  capabilities: readonly MobileCapability[] = DEFAULT_DEVICE_CAPABILITIES
): { app: Express; token: string } {
  const created = createTestApp({ barcode });
  apps.push(created);

  const row = deviceRow({
    capabilities: serialiseDeviceCapabilities(capabilities),
    capabilityMode: 'explicit',
  });
  created.db.insert(devices).values(row).run();
  const { token } = mintAccessToken(row.id, created.accessTokenSigningKey);

  return { app: created.app, token };
}

function barcodeClient(outcome: GatewayOutcome<MobileBarcodeLookupOutcome>): MobileBarcodeClient {
  return { lookup: () => Promise.resolve(outcome) };
}

function lookup(app: Express, token: string, code = '9780330423304') {
  return requestOn(app, (r) =>
    r.get(`/mobile/barcode/lookup/${code}`).set('Authorization', `Bearer ${token}`)
  );
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

  it('maps every current gateway failure and timeout failure to unavailable', async () => {
    const failures: readonly GatewayFailure[] = [
      { kind: 'unavailable', pillar: 'barcode', status: 503 },
      { kind: 'degraded', pillar: 'barcode', reason: 'reconciling', status: 503 },
      { kind: 'contract-mismatch', pillar: 'barcode', status: 502 },
      { kind: 'not-found', pillar: 'barcode', status: 404 },
      { kind: 'conflict', pillar: 'barcode', status: 409 },
      { kind: 'invalid-request', pillar: 'barcode', status: 400 },
      { kind: 'unsupported-media', pillar: 'barcode', status: 415 },
      { kind: 'gateway-misconfigured', pillar: 'barcode', status: 502 },
      { kind: 'protocol-too-old', pillar: 'barcode', status: 426 },
    ];

    for (const failure of failures) {
      const { app, token } = openWith(barcodeClient(failure));
      const response = await lookup(app, token);

      expect(response.status, failure.kind).toBe(200);
      expect(response.body, failure.kind).toEqual({ outcome: 'unavailable' });
    }
  });

  it('maps a malformed client outcome to unavailable', async () => {
    const { app, token } = openWith(
      barcodeClient({ kind: 'contract-mismatch', pillar: 'barcode', status: 502 })
    );

    const response = await lookup(app, token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ outcome: 'unavailable' });
  });

  it('requires barcode.read', async () => {
    const { app, token } = openWith(
      barcodeClient({ kind: 'ok', value: { outcome: 'not_found' } }),
      ['session.read']
    );

    const response = await lookup(app, token);

    expect(response.status).toBe(403);
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
