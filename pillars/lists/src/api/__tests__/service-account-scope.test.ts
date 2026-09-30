import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openListsDb, type OpenedListsDb } from '../../db/index.js';
import { createListsApiApp } from '../app.js';
import { listsScopeMap } from '../middleware/service-account-scope.js';
import { createTestTransport } from './test-http.js';

import type { ServiceAccountVerification, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const { requestOn } = createTestTransport();
const TEST_API_KEY = 'test-only-key';

let tmpDir: string;
let listsDb: OpenedListsDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'lists-api-scope-test-'));
  listsDb = openListsDb(join(tmpDir, 'lists.db'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  listsDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function verifierReturning(verification: ServiceAccountVerification): ServiceAccountVerifier {
  return () => Promise.resolve(verification);
}

function grantedScopes(scopes: readonly string[]): ServiceAccountVerification {
  return {
    outcome: 'authenticated',
    principal: { id: 'sa_lists', name: 'lists-test', scopes },
  };
}

function app(verify: ServiceAccountVerifier) {
  return createListsApiApp({
    listsDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3006',
    serviceAccountVerifier: verify,
  });
}

function listIndexScope(): string {
  const route = listsScopeMap.routes.find(
    (candidate) => candidate.method === 'GET' && candidate.path === '/lists'
  );
  if (route === undefined) throw new Error('The lists contract is missing GET /lists');
  return route.scope;
}

describe('lists scope map', () => {
  it('covers the contract with lists-rooted scopes', () => {
    expect(listsScopeMap.routes.length).toBeGreaterThan(0);
    expect(listsScopeMap.routes.every((route) => route.scope.startsWith('lists.'))).toBe(true);
    expect(listIndexScope()).toMatch(/^lists\./);
  });
});

describe('a request without a credential', () => {
  it('reaches the handler without consulting the registry', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const response = await requestOn(app(verify)).get('/lists');

    expect(response.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('a live credential with the required grant', () => {
  it('admits a service account scoped to the list index route', async () => {
    const response = await requestOn(app(verifierReturning(grantedScopes([listIndexScope()]))))
      .get('/lists')
      .set('x-api-key', TEST_API_KEY);

    expect(response.status).toBe(200);
  });
});

describe('a live credential without the required grant', () => {
  it('403s the request and logs the account name and missing scope', async () => {
    const warn = vi.spyOn(console, 'warn');
    const response = await requestOn(app(verifierReturning(grantedScopes(['lists.items']))))
      .get('/lists')
      .set('x-api-key', TEST_API_KEY);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'lists.auth.forbidden',
      retryable: false,
    });
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('lists-test');
    expect(logged).toContain(listIndexScope());
    expect(logged).not.toContain(TEST_API_KEY);
  });
});

describe('a key the registry does not recognise', () => {
  it('returns 401 instead of falling back to network trust', async () => {
    const response = await requestOn(app(verifierReturning({ outcome: 'rejected' })))
      .get('/lists')
      .set('x-api-key', TEST_API_KEY);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      code: 'lists.auth.invalid',
      retryable: false,
    });
  });
});

describe('when the registry cannot verify a key', () => {
  it('returns 503 without exposing the key or registry detail', async () => {
    const response = await requestOn(
      app(verifierReturning({ outcome: 'unavailable', detail: 'registry connection failed' }))
    )
      .get('/lists')
      .set('x-api-key', TEST_API_KEY);

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      code: 'lists.auth.unavailable',
      retryable: true,
    });
    expect(response.text).not.toContain(TEST_API_KEY);
    expect(response.text).not.toContain('registry connection failed');
  });
});

describe('routes outside the contract', () => {
  it('does not gate health, pillars, or OpenAPI routes', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const api = requestOn(app(verify));

    for (const path of ['/health', '/pillars', '/openapi']) {
      const response = await api.get(path).set('x-api-key', TEST_API_KEY);
      expect(response.status).toBe(200);
    }

    expect(verify).not.toHaveBeenCalled();
  });
});
