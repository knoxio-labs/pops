/**
 * Integration tests for purchases' inbound service-account gate, driven
 * through the real Express app.
 *
 * The four cases that decide whether the gate is worth anything: no
 * credential, a credential the registry rejects, a live credential whose grant
 * does not cover the operation, and a live credential that does. Plus the one
 * that decides whether it fails closed: a registry that cannot be reached.
 *
 * The no-credential case is the load-bearing one here, not a formality. Three
 * uncredentialled callers carry the pillar's ingest paths — the ingest CLI,
 * the operator smoke script, `two-process.test.ts` — so "an uncredentialled
 * request still reaches the handler" is the assertion that they survived this
 * change. The credentialled cases now have real callers too: the MCP tools and
 * the orchestrator's federated search both present a key.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { createPurchasesApiApp } from '../app.js';
import { purchasesScopeMap } from '../middleware/service-account-scope.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';

import type { Express } from 'express';

import type { ServiceAccountVerification, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

import type { OpenedPurchasesDb } from '../../db/index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

const KEY = 'pops_sa_abcdefgh.a-secret-that-never-leaves-this-file';

const newOrder = {
  source: 'amazon',
  sourceOrderId: '249-1512883-0105415',
  ingestMethod: 'export',
  orderedAt: '2026-02-02T01:41:21Z',
  currency: 'AUD',
  totalCents: 5678,
  checksum: 'sa-scope-1',
};

function verifierReturning(verification: ServiceAccountVerification): ServiceAccountVerifier {
  return () => Promise.resolve(verification);
}

const grantedScopes = (scopes: readonly string[]): ServiceAccountVerification => ({
  outcome: 'authenticated',
  principal: { id: 'sa_mcp', name: 'pops_api_key', scopes },
});

function app(verify: ServiceAccountVerifier): Express {
  return createPurchasesApiApp({
    vision: null,
    purchasesDb: opened,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3013',
    serviceAccountVerifier: verify,
  });
}

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
  __resetPillarRegistryCache();
  delete process.env['POPS_PILLARS'];
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  __resetPillarRegistryCache();
});

describe('the purchases scope map', () => {
  it('covers the whole contract, so no route is gated by an empty table', () => {
    expect(purchasesScopeMap.routes.length).toBeGreaterThan(10);
    expect(purchasesScopeMap.routes.every((route) => route.scope.startsWith('purchases.'))).toBe(
      true
    );
  });

  it('reaches both the read and the write halves of the surface', () => {
    const scopes = purchasesScopeMap.routes.map((route) => route.scope);

    expect(scopes).toContain('purchases.purchase.list');
    expect(scopes).toContain('purchases.purchase.create');
    expect(scopes).toContain('purchases.source.upsert');
    expect(scopes).toContain('purchases.reconcile.confirm');
  });
});

describe('a request with no credential', () => {
  it('reads without one — the ingest CLI and the smoke script present none', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const response = await request(app(verify)).get('/purchases');

    expect(response.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
  });

  it('writes without one — this is the only real data path the pillar has', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const response = await request(app(verify)).post('/purchases').send(newOrder);

    expect(response.status).toBe(201);
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('a live credential whose grant does not cover the operation', () => {
  it('403s a purchase-only account reaching the source surface', async () => {
    const response = await request(app(verifierReturning(grantedScopes(['purchases.purchase']))))
      .put('/sources/amazon')
      .set('x-api-key', KEY)
      .send({ label: 'Amazon', ingestAdapter: 'amazon-export' });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ message: expect.stringContaining('not authorised') });
  });

  it('403s an account granted a neighbouring pillar entirely', async () => {
    const response = await request(app(verifierReturning(grantedScopes(['finance', 'inventory']))))
      .get('/purchases')
      .set('x-api-key', KEY);

    expect(response.status).toBe(403);
  });

  it('names the account and the missing scope so the grant can be widened', async () => {
    const warn = vi.spyOn(console, 'warn');
    await request(app(verifierReturning(grantedScopes(['purchases.purchase']))))
      .put('/sources/amazon')
      .set('x-api-key', KEY)
      .send({ label: 'Amazon', ingestAdapter: 'amazon-export' });

    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('pops_api_key');
    expect(logged).toContain('purchases.source.upsert');
    expect(logged).not.toContain(KEY);
  });
});

describe('a live credential whose grant covers the operation', () => {
  it('admits a purchase-scoped account to the purchase surface', async () => {
    const response = await request(app(verifierReturning(grantedScopes(['purchases.purchase']))))
      .get('/purchases')
      .set('x-api-key', KEY);

    expect(response.status).toBe(200);
  });

  it('matches by dot prefix, not by exact procedure', async () => {
    const response = await request(app(verifierReturning(grantedScopes(['purchases']))))
      .put('/sources/amazon')
      .set('x-api-key', KEY)
      .send({ label: 'Amazon', ingestAdapter: 'amazon-export' });

    expect(response.status).toBe(200);
  });
});

describe('failing closed', () => {
  it('401s a key the registry does not recognise, rather than falling back to network trust', async () => {
    const response = await request(app(verifierReturning({ outcome: 'rejected' })))
      .get('/purchases')
      .set('x-api-key', KEY);

    expect(response.status).toBe(401);
  });

  it('401s an unknown key on a write, so the gate is not read-only', async () => {
    const response = await request(app(verifierReturning({ outcome: 'rejected' })))
      .post('/purchases')
      .set('x-api-key', KEY)
      .send(newOrder);

    expect(response.status).toBe(401);
  });

  it('503s rather than admitting a caller it could not verify', async () => {
    const response = await request(
      app(verifierReturning({ outcome: 'unavailable', detail: 'ECONNREFUSED' }))
    )
      .get('/purchases')
      .set('x-api-key', KEY);

    expect(response.status).toBe(503);
  });

  it('leaks neither the key nor the registry detail to the caller', async () => {
    const response = await request(
      app(verifierReturning({ outcome: 'unavailable', detail: 'ECONNREFUSED registry-api:3001' }))
    )
      .get('/purchases')
      .set('x-api-key', KEY);

    expect(response.text).not.toContain(KEY);
    expect(response.text).not.toContain('ECONNREFUSED');
  });
});

describe('paths outside the contract', () => {
  it('does not gate the health probe, even with a rejected key', async () => {
    const response = await request(app(verifierReturning({ outcome: 'rejected' })))
      .get('/health')
      .set('x-api-key', KEY);

    expect(response.status).toBe(200);
  });

  it('does not gate the pillar listing', async () => {
    const response = await request(app(verifierReturning({ outcome: 'rejected' })))
      .get('/pillars')
      .set('x-api-key', KEY);

    expect(response.status).toBe(200);
  });

  it('does not gate the OpenAPI projection', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const response = await request(app(verify)).get('/openapi').set('x-api-key', KEY);

    expect(response.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
  });
});
