/**
 * Integration tests for finance's inbound service-account gate, driven through
 * the real Express app.
 *
 * The three cases that decide whether the gate is worth anything: no
 * credential, a live credential whose grant does not cover the operation, and
 * a live credential that does. Plus the two that decide whether it fails
 * closed: a key the registry rejects, and a registry that cannot be reached.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { financeScopeMap } from '../middleware/service-account-scope.js';
import { makeContactsFake } from './contacts-fake.js';
import { requestOn } from './test-utils.js';

import type { ServiceAccountVerification, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-sa-scope-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const KEY = 'pops_sa_abcdefgh.a-secret-that-never-leaves-this-file';

function verifierReturning(verification: ServiceAccountVerification): ServiceAccountVerifier {
  return () => Promise.resolve(verification);
}

const grantedScopes = (scopes: readonly string[]): ServiceAccountVerification => ({
  outcome: 'authenticated',
  principal: { id: 'sa_bfm', name: 'bfm', scopes },
});

function app(verify: ServiceAccountVerifier) {
  return createFinanceApiApp({
    financeDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3004',
    contacts: makeContactsFake(),
    serviceAccountVerifier: verify,
  });
}

describe('finance scope map', () => {
  it('covers the contract, so no route is gated by an empty table', () => {
    expect(financeScopeMap.routes.length).toBeGreaterThan(10);
    expect(financeScopeMap.routes.every((r) => r.scope.startsWith('finance.'))).toBe(true);
  });
});

describe('a request with no credential', () => {
  it('reaches the handler — the perimeter still governs browser traffic', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const response = await requestOn(app(verify), (agent) => agent.get('/budgets'));

    expect(response.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('a live credential whose grant does not cover the operation', () => {
  it('403s a transactions-only account reaching budgets', async () => {
    const response = await requestOn(
      app(verifierReturning(grantedScopes(['finance.transactions']))),
      (agent) => agent.get('/budgets').set('x-api-key', KEY)
    );

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ message: expect.stringContaining('not authorised') });
  });

  it('403s an account granted a neighbouring pillar entirely', async () => {
    const response = await requestOn(
      app(verifierReturning(grantedScopes(['inventory', 'media.watchlist']))),
      (agent) => agent.get('/transactions').set('x-api-key', KEY)
    );

    expect(response.status).toBe(403);
  });

  it('names the account and the missing scope so the grant can be widened', async () => {
    const warn = vi.spyOn(console, 'warn');
    await requestOn(app(verifierReturning(grantedScopes(['finance.transactions']))), (agent) =>
      agent.get('/budgets').set('x-api-key', KEY)
    );

    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('bfm');
    expect(logged).toContain('finance.budgets.list');
    expect(logged).not.toContain(KEY);
  });
});

describe('a live credential whose grant covers the operation', () => {
  it('admits a transactions-scoped account to transactions', async () => {
    const response = await requestOn(
      app(verifierReturning(grantedScopes(['finance.transactions']))),
      (agent) => agent.get('/transactions').set('x-api-key', KEY)
    );

    expect(response.status).toBe(200);
  });

  it('matches by dot prefix, not by exact procedure', async () => {
    const response = await requestOn(app(verifierReturning(grantedScopes(['finance']))), (agent) =>
      agent.get('/budgets').set('x-api-key', KEY)
    );

    expect(response.status).toBe(200);
  });
});

describe('failing closed', () => {
  it('401s a key the registry does not recognise, rather than falling back to network trust', async () => {
    const response = await requestOn(app(verifierReturning({ outcome: 'rejected' })), (agent) =>
      agent.get('/transactions').set('x-api-key', KEY)
    );

    expect(response.status).toBe(401);
  });

  it('503s rather than admitting a caller it could not verify', async () => {
    const response = await requestOn(
      app(verifierReturning({ outcome: 'unavailable', detail: 'ECONNREFUSED' })),
      (agent) => agent.get('/transactions').set('x-api-key', KEY)
    );

    expect(response.status).toBe(503);
  });

  it('leaks neither the key nor the registry detail to the caller', async () => {
    const response = await requestOn(
      app(verifierReturning({ outcome: 'unavailable', detail: 'ECONNREFUSED registry-api:3001' })),
      (agent) => agent.get('/transactions').set('x-api-key', KEY)
    );

    expect(response.text).not.toContain(KEY);
    expect(response.text).not.toContain('ECONNREFUSED');
  });
});

describe('paths outside the contract', () => {
  it('does not gate the health probe, even with a rejected key', async () => {
    const response = await requestOn(app(verifierReturning({ outcome: 'rejected' })), (agent) =>
      agent.get('/health').set('x-api-key', KEY)
    );

    expect(response.status).toBe(200);
  });

  it('does not gate the OpenAPI projection', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const response = await requestOn(app(verify), (agent) =>
      agent.get('/openapi').set('x-api-key', KEY)
    );

    expect(response.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
  });
});
