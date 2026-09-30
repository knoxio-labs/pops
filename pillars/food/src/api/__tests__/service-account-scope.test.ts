import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openFoodDb, type OpenedFoodDb } from '../../db/index.js';
import { createFoodApiApp } from '../app.js';
import { foodScopeMap } from '../middleware/service-account-scope.js';
import { createTestTransport } from './test-http.js';

import type { ServiceAccountVerification, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const { requestOn } = createTestTransport();
const TEST_API_KEY = 'test-only-key';

let tmpDir: string;
let foodDb: OpenedFoodDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-scope-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function verifierReturning(verification: ServiceAccountVerification): ServiceAccountVerifier {
  return () => Promise.resolve(verification);
}

function grantedScopes(scopes: readonly string[]): ServiceAccountVerification {
  return {
    outcome: 'authenticated',
    principal: { id: 'sa_food', name: 'food-test', scopes },
  };
}

function app(verify: ServiceAccountVerifier) {
  return createFoodApiApp({
    foodDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3005',
    serviceAccountVerifier: verify,
  });
}

function ingredientListScope(): string {
  const route = foodScopeMap.routes.find(
    (candidate) => candidate.method === 'GET' && candidate.path === '/ingredients'
  );
  if (route === undefined) throw new Error('The food contract is missing GET /ingredients');
  return route.scope;
}

describe('food scope map', () => {
  it('covers the contract with food-rooted scopes', () => {
    expect(foodScopeMap.routes.length).toBeGreaterThan(0);
    expect(foodScopeMap.routes.every((route) => route.scope.startsWith('food.'))).toBe(true);
    expect(ingredientListScope()).toMatch(/^food\./);
  });
});

describe('a request without a service-account credential', () => {
  it('reaches the contract handler without consulting the registry', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const response = await requestOn(app(verify)).get('/ingredients');

    expect(response.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('a live credential with the required grant', () => {
  it('admits a service account scoped to the ingredient list route', async () => {
    const response = await requestOn(app(verifierReturning(grantedScopes([ingredientListScope()]))))
      .get('/ingredients')
      .set('x-api-key', TEST_API_KEY);

    expect(response.status).toBe(200);
  });
});

describe('a live credential without the required grant', () => {
  it('403s the request and logs the account name and missing scope', async () => {
    const warn = vi.spyOn(console, 'warn');
    const response = await requestOn(app(verifierReturning(grantedScopes(['food.fridge']))))
      .get('/ingredients')
      .set('x-api-key', TEST_API_KEY);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'food.auth.forbidden',
      retryable: false,
    });
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('food-test');
    expect(logged).toContain(ingredientListScope());
    expect(logged).not.toContain(TEST_API_KEY);
  });
});

describe('a key the registry does not recognise', () => {
  it('returns 401 instead of falling back to network trust', async () => {
    const response = await requestOn(app(verifierReturning({ outcome: 'rejected' })))
      .get('/ingredients')
      .set('x-api-key', TEST_API_KEY);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      code: 'food.auth.invalid',
      retryable: false,
    });
  });
});

describe('when the registry cannot verify a key', () => {
  it('returns 503 without exposing the key or registry detail', async () => {
    const response = await requestOn(
      app(verifierReturning({ outcome: 'unavailable', detail: 'registry connection failed' }))
    )
      .get('/ingredients')
      .set('x-api-key', TEST_API_KEY);

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      code: 'food.auth.unavailable',
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

describe('the internal worker callback', () => {
  it('still requires its internal credential without consulting the registry', async () => {
    const verify = vi.fn(
      verifierReturning({
        outcome: 'authenticated',
        principal: { id: 'sa_food', name: 'food-test', scopes: ['food'] },
      })
    );
    const response = await requestOn(app(verify)).post('/ingest/worker-complete').send({});

    expect(response.status).toBe(401);
    expect(verify).not.toHaveBeenCalled();
  });
});
