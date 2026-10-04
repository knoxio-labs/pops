import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDocumentsApiApp } from '../app.js';
import { documentsRawScopeMap, documentsScopeMap } from '../middleware/service-account-scope.js';
import { createTestTransport } from './test-http.js';

import type { ServiceAccountVerification, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const { requestOn } = createTestTransport();
const TEST_API_KEY = 'test-only-key';

function verifierReturning(verification: ServiceAccountVerification): ServiceAccountVerifier {
  return () => Promise.resolve(verification);
}

function grantedScopes(scopes: readonly string[]): ServiceAccountVerification {
  return {
    outcome: 'authenticated',
    principal: { id: 'sa_inventory', name: 'inventory-import', scopes },
  };
}

function app(verify: ServiceAccountVerifier) {
  return createDocumentsApiApp({
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3012',
    serviceAccountVerifier: verify,
  });
}

function paperlessStatusScope(): string {
  const route = documentsScopeMap.routes.find(
    (candidate) => candidate.method === 'GET' && candidate.path === '/paperless/status'
  );
  if (route === undefined)
    throw new Error('The documents contract is missing GET /paperless/status');
  return route.scope;
}

beforeEach(() => {
  vi.stubEnv('PAPERLESS_BASE_URL', '');
  vi.stubEnv('PAPERLESS_API_TOKEN', '');
  vi.stubEnv('POPS_PILLARS', '');
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('documents scope maps', () => {
  it('covers the whole contract with documents-rooted scopes', () => {
    expect(documentsScopeMap.routes.length).toBeGreaterThan(0);
    expect(documentsScopeMap.routes.every((route) => route.scope.startsWith('documents.'))).toBe(
      true
    );
    expect(paperlessStatusScope()).toBe('documents.paperless.status');
  });

  it('covers the raw Paperless thumbnail route', () => {
    expect(documentsRawScopeMap.routes).toEqual([
      {
        method: 'GET',
        path: '/documents/:id/thumbnail',
        scope: 'documents.paperless.thumbnail',
      },
    ]);
  });
});

describe('requests without a service-account credential', () => {
  it('keeps the inventory network-perimeter call working without a registry lookup', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const response = await requestOn(app(verify)).get('/paperless/status');

    expect(response.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('a presented service-account credential', () => {
  it('admits a service account with the required Paperless scope', async () => {
    const response = await requestOn(app(verifierReturning(grantedScopes(['documents.paperless']))))
      .get('/paperless/status')
      .set('x-api-key', TEST_API_KEY);

    expect(response.status).toBe(200);
  });

  it('403s a live account missing the route scope and logs the account and required scope', async () => {
    const warn = vi.spyOn(console, 'warn');
    const response = await requestOn(
      app(verifierReturning(grantedScopes(['documents.paperless.search'])))
    )
      .get('/paperless/status')
      .set('x-api-key', TEST_API_KEY);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'documents.auth.forbidden',
      retryable: false,
    });
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('inventory-import');
    expect(logged).toContain(paperlessStatusScope());
    expect(logged).not.toContain(TEST_API_KEY);
  });

  it('401s an unknown key on a contract route', async () => {
    const response = await requestOn(app(verifierReturning({ outcome: 'rejected' })))
      .get('/paperless/status')
      .set('x-api-key', TEST_API_KEY);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      code: 'documents.auth.invalid',
      retryable: false,
    });
  });

  it('503s without exposing registry details when verification is unavailable', async () => {
    const response = await requestOn(
      app(verifierReturning({ outcome: 'unavailable', detail: 'registry connection failed' }))
    )
      .get('/paperless/status')
      .set('x-api-key', TEST_API_KEY);

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      code: 'documents.auth.unavailable',
      retryable: true,
    });
    expect(response.text).not.toContain(TEST_API_KEY);
    expect(response.text).not.toContain('registry connection failed');
  });
});

describe('raw thumbnails and perimeter probes', () => {
  it('checks a key before proxying a thumbnail', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const response = await requestOn(app(verify))
      .get('/documents/1/thumbnail')
      .set('x-api-key', TEST_API_KEY);

    expect(response.status).toBe(401);
    expect(verify).toHaveBeenCalledOnce();
  });

  it('leaves health, pillars and OpenAPI outside the scope gate', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const api = requestOn(app(verify));

    for (const path of ['/health', '/pillars', '/openapi']) {
      const response = await api.get(path).set('x-api-key', TEST_API_KEY);
      expect(response.status).toBe(200);
    }

    expect(verify).not.toHaveBeenCalled();
  });
});
