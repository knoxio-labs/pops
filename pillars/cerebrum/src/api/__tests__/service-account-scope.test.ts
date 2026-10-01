/** Integration tests for Cerebrum's inbound service-account gate. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import { cerebrumScopeMap } from '../middleware/service-account-scope.js';
import { createTestTransport } from './test-http.js';
import { makeCerebrumApiDeps } from './test-utils.js';

import type { ServiceAccountVerification, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-sa-scope-test-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const TEST_KEY = 'test-service-account-key';
const { requestOn } = createTestTransport();

function verifierReturning(verification: ServiceAccountVerification): ServiceAccountVerifier {
  return () => Promise.resolve(verification);
}

const grantedScopes = (scopes: readonly string[]): ServiceAccountVerification => ({
  outcome: 'authenticated',
  principal: { id: 'sa_moltbot', name: 'moltbot', scopes },
});

function app(verify: ServiceAccountVerifier) {
  return createCerebrumApiApp(
    makeCerebrumApiDeps({ cerebrumDb, tmpDir }, { serviceAccountVerifier: verify })
  );
}

describe('Cerebrum scope map', () => {
  it('covers the contract with Cerebrum scopes', () => {
    expect(cerebrumScopeMap.routes.length).toBeGreaterThan(10);
    expect(cerebrumScopeMap.routes.every((route) => route.scope.startsWith('cerebrum.'))).toBe(
      true
    );
  });
});

describe('requests with no credential', () => {
  it('reach the contract handler without registry verification', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const response = await requestOn(app(verify)).get('/settings');

    expect(response.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('presented credentials', () => {
  it('admits a key with the required scope', async () => {
    const response = await requestOn(app(verifierReturning(grantedScopes(['cerebrum.settings']))))
      .get('/settings')
      .set('x-api-key', TEST_KEY);

    expect(response.status).toBe(200);
  });

  it('rejects an unknown or revoked key with 401', async () => {
    const response = await requestOn(app(verifierReturning({ outcome: 'rejected' })))
      .get('/settings')
      .set('x-api-key', TEST_KEY);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'cerebrum.auth.invalid', retryable: false });
  });

  it('rejects a missing scope with 403 and logs the account and required scope, never the key', async () => {
    const warn = vi.spyOn(console, 'warn');
    const response = await requestOn(app(verifierReturning(grantedScopes(['cerebrum.templates']))))
      .get('/settings')
      .set('x-api-key', TEST_KEY);

    expect(response.status).toBe(403);
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('moltbot');
    expect(logged).toContain('cerebrum.settings');
    expect(logged).not.toContain(TEST_KEY);
  });

  it('fails closed with 503 when the registry cannot be reached', async () => {
    const response = await requestOn(
      app(verifierReturning({ outcome: 'unavailable', detail: 'registry connection failed' }))
    )
      .get('/settings')
      .set('x-api-key', TEST_KEY);

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ code: 'cerebrum.auth.unavailable', retryable: true });
    expect(response.text).not.toContain(TEST_KEY);
    expect(response.text).not.toContain('registry connection failed');
  });
});

describe('raw routes outside the contract', () => {
  it('leaves health and OpenAPI outside the scope map', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const api = app(verify);
    const health = await requestOn(api).get('/health').set('x-api-key', TEST_KEY);
    const openapi = await requestOn(api).get('/openapi').set('x-api-key', TEST_KEY);

    expect(health.status).toBe(200);
    expect(openapi.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
  });
});
