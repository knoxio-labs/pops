/**
 * The shared gate, driven through a real Express app over a synthetic
 * contract.
 *
 * A lib may never import a pillar, so the contract here is a literal in the
 * shape ts-rest produces — which is also the point: the gate is asserted
 * against the structure it actually consumes rather than against one pillar's
 * router, so a pillar adopting it inherits tested behaviour instead of a
 * promise.
 */
import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createServiceAccountScopeGate } from '../service-account-scope-gate.js';

import type { ServiceAccountVerification, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const contract = {
  orders: {
    list: { method: 'GET', path: '/orders' },
    get: { method: 'GET', path: '/orders/:id' },
    create: { method: 'POST', path: '/orders' },
  },
  sources: {
    upsert: { method: 'PUT', path: '/sources/:id' },
  },
};

const KEY = 'pops_sa_abcdefgh.a-secret-that-never-leaves-this-file';

function verifierReturning(verification: ServiceAccountVerification): ServiceAccountVerifier {
  return () => Promise.resolve(verification);
}

const grantedScopes = (scopes: readonly string[]): ServiceAccountVerification => ({
  outcome: 'authenticated',
  principal: { id: 'sa_test', name: 'ingest-cli', scopes },
});

function appWith(verify: ServiceAccountVerifier, requireCredential?: boolean): Express {
  const gate = createServiceAccountScopeGate({
    contract,
    rootScope: 'widgets',
    logPrefix: 'widgets-api',
    requireCredential,
  });
  const app = express();
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use(gate.createMiddleware(verify));
  app.get('/orders', (_req, res) => {
    res.json({ orders: [] });
  });
  app.get('/orders/:id', (_req, res) => {
    res.json({ id: 'one' });
  });
  app.post('/orders', (_req, res) => {
    res.status(201).json({ created: true });
  });
  app.put('/sources/:id', (_req, res) => {
    res.json({ upserted: true });
  });
  return app;
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the scope table derived from the contract', () => {
  it('projects every leaf onto a dotted scope under the root', () => {
    const { scopeMap } = createServiceAccountScopeGate({
      contract,
      rootScope: 'widgets',
      logPrefix: 'widgets-api',
    });

    expect(scopeMap.routes).toHaveLength(4);
    expect(scopeMap.routes.map((route) => route.scope).toSorted()).toEqual([
      'widgets.orders.create',
      'widgets.orders.get',
      'widgets.orders.list',
      'widgets.sources.upsert',
    ]);
  });
});

describe('a request presenting no credential', () => {
  it('reaches the handler under the default posture, without consulting the registry', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const response = await request(appWith(verify)).get('/orders');

    expect(response.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
  });

  it('is 401ed when the pillar requires a credential', async () => {
    const response = await request(appWith(verifierReturning({ outcome: 'rejected' }), true)).get(
      '/orders'
    );

    expect(response.status).toBe(401);
  });

  it('still reaches an unscoped path when the pillar requires a credential', async () => {
    const response = await request(appWith(verifierReturning({ outcome: 'rejected' }), true)).get(
      '/health'
    );

    expect(response.status).toBe(200);
  });
});

describe('a live credential', () => {
  it('is admitted where its grant covers the operation', async () => {
    const response = await request(appWith(verifierReturning(grantedScopes(['widgets.orders']))))
      .get('/orders')
      .set('x-api-key', KEY);

    expect(response.status).toBe(200);
  });

  it('matches by dot prefix, so the root scope covers the whole contract', async () => {
    const response = await request(appWith(verifierReturning(grantedScopes(['widgets']))))
      .put('/sources/abc')
      .set('x-api-key', KEY);

    expect(response.status).toBe(200);
  });

  it('403s where its grant misses the operation', async () => {
    const response = await request(appWith(verifierReturning(grantedScopes(['widgets.orders']))))
      .put('/sources/abc')
      .set('x-api-key', KEY);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ message: expect.stringContaining('not authorised') });
  });

  it('403s a grant that names a neighbouring pillar entirely', async () => {
    const response = await request(appWith(verifierReturning(grantedScopes(['widgetsmith']))))
      .get('/orders')
      .set('x-api-key', KEY);

    expect(response.status).toBe(403);
  });

  it('discriminates a parameterised route from its literal sibling', async () => {
    const response = await request(
      appWith(verifierReturning(grantedScopes(['widgets.orders.get'])))
    )
      .post('/orders')
      .set('x-api-key', KEY);

    expect(response.status).toBe(403);
  });
});

describe('the rejection log', () => {
  it('names the pillar, the account and the missing scope, and never the key', async () => {
    const warn = vi.spyOn(console, 'warn');
    await request(appWith(verifierReturning(grantedScopes(['widgets.orders']))))
      .put('/sources/abc')
      .set('x-api-key', KEY);

    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('[widgets-api]');
    expect(logged).toContain('ingest-cli');
    expect(logged).toContain('widgets.sources.upsert');
    expect(logged).not.toContain(KEY);
  });

  it('names the reason when there is no principal to name', async () => {
    const warn = vi.spyOn(console, 'warn');
    await request(appWith(verifierReturning({ outcome: 'rejected' })))
      .get('/orders')
      .set('x-api-key', KEY);

    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('invalid-credential');
    expect(logged).not.toContain(KEY);
  });
});

describe('failing closed', () => {
  it('401s a key the registry does not recognise, rather than falling back to network trust', async () => {
    const response = await request(appWith(verifierReturning({ outcome: 'rejected' })))
      .get('/orders')
      .set('x-api-key', KEY);

    expect(response.status).toBe(401);
  });

  it('503s rather than admitting a caller it could not verify', async () => {
    const response = await request(
      appWith(verifierReturning({ outcome: 'unavailable', detail: 'ECONNREFUSED' }))
    )
      .get('/orders')
      .set('x-api-key', KEY);

    expect(response.status).toBe(503);
  });

  it('leaks neither the key nor the registry detail to the caller', async () => {
    const response = await request(
      appWith(
        verifierReturning({ outcome: 'unavailable', detail: 'ECONNREFUSED registry-api:3001' })
      )
    )
      .get('/orders')
      .set('x-api-key', KEY);

    expect(response.text).not.toContain(KEY);
    expect(response.text).not.toContain('ECONNREFUSED');
  });

  it('hands a verifier that throws to the error pipeline instead of admitting the caller', async () => {
    const app = appWith(() => Promise.reject(new Error('boom')));
    const response = await request(app).get('/orders').set('x-api-key', KEY);

    expect(response.status).toBe(500);
  });
});

describe('paths the contract does not describe', () => {
  it('are untouched, even carrying a key the registry rejects', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const response = await request(appWith(verify)).get('/health').set('x-api-key', KEY);

    expect(response.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
  });
});
