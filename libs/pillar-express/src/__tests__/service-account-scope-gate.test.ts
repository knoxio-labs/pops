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

describe('an empty projection', () => {
  it('throws rather than building a gate that admits every request', () => {
    expect(() =>
      createServiceAccountScopeGate({
        contract: {},
        rootScope: 'widgets',
        logPrefix: 'widgets-api',
      })
    ).toThrow(/widgets-api/);
  });

  it('names the pillar so the wrong-object mistake is findable from the crash', () => {
    expect(() =>
      createServiceAccountScopeGate({
        contract: { openapi: '3.0.0', paths: {} },
        rootScope: 'sources',
        logPrefix: 'sources-api',
      })
    ).toThrow(/sources-api/);
  });

  it('still throws for a contract shaped as a bare route leaf with no children', () => {
    expect(() =>
      createServiceAccountScopeGate({
        contract: { method: 'GET' },
        rootScope: 'widgets',
        logPrefix: 'widgets-api',
      })
    ).toThrow();
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

  it('does not call a request that presented no key a credentialled one', async () => {
    const warn = vi.spyOn(console, 'warn');
    await request(appWith(verifierReturning({ outcome: 'rejected' }), true)).get('/orders');

    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('rejected an uncredentialled request');
    expect(logged).toContain('widgets.orders.list');
    expect(logged).not.toContain('rejected a credentialled request');
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

describe('declared raw routes', () => {
  const rawRoutes = {
    blobs: {
      upload: { method: 'PUT', path: '/blobs/:sha256' },
      read: { method: 'GET', path: '/blobs/:sha256' },
    },
  };

  function rawApp(verify: ServiceAccountVerifier, requireCredential?: boolean): Express {
    const gate = createServiceAccountScopeGate({
      contract,
      rootScope: 'widgets',
      logPrefix: 'widgets-api',
      requireCredential,
      rawRoutes,
    });
    const app = express();
    app.get('/health', (_req, res) => {
      res.json({ ok: true });
    });
    app.use(gate.createMiddleware(verify));
    app.get('/orders', (_req, res) => {
      res.json({ orders: [] });
    });
    app.put('/blobs/:sha256', (_req, res) => {
      res.status(201).json({ stored: true });
    });
    app.get('/blobs/:sha256', (_req, res) => {
      res.json({ bytes: 'secret' });
    });
    app.get('/undeclared/:id', (_req, res) => {
      res.json({ open: true });
    });
    return app;
  }

  it('projects them under the root beside the contract, not into it', () => {
    const gate = createServiceAccountScopeGate({
      contract,
      rootScope: 'widgets',
      logPrefix: 'widgets-api',
      rawRoutes,
    });

    expect(gate.rawScopeMap.routes.map((route) => route.scope).toSorted()).toEqual([
      'widgets.blobs.read',
      'widgets.blobs.upload',
    ]);
    expect(gate.scopeMap.routes).toHaveLength(4);
  });

  it('project to nothing when none are declared, leaving every non-contract path untouched', () => {
    const gate = createServiceAccountScopeGate({
      contract,
      rootScope: 'widgets',
      logPrefix: 'widgets-api',
    });

    expect(gate.rawScopeMap.routes).toHaveLength(0);
  });

  it.each([
    ['PUT', 'widgets.blobs'],
    ['GET', 'widgets.blobs'],
    ['PUT', 'widgets'],
    ['GET', 'widgets.blobs.read'],
  ] as const)('admit %s under a grant of %s where it covers the route', async (method, scope) => {
    const agent = request(rawApp(verifierReturning(grantedScopes([scope]))));
    const response = await (method === 'PUT' ? agent.put('/blobs/abc') : agent.get('/blobs/abc'))
      .set('x-api-key', KEY)
      .send();

    expect(response.status).toBe(method === 'PUT' ? 201 : 200);
  });

  it.each(['PUT', 'GET'] as const)(
    '403 a %s from a key whose grant covers only the contract',
    async (method) => {
      const agent = request(rawApp(verifierReturning(grantedScopes(['widgets.orders']))));
      const response = await (method === 'PUT' ? agent.put('/blobs/abc') : agent.get('/blobs/abc'))
        .set('x-api-key', KEY)
        .send();

      expect(response.status).toBe(403);
    }
  );

  it('403 an upload from a key granted only the read leaf', async () => {
    const response = await request(rawApp(verifierReturning(grantedScopes(['widgets.blobs.read']))))
      .put('/blobs/abc')
      .set('x-api-key', KEY);

    expect(response.status).toBe(403);
  });

  it('name the raw scope in the rejection log', async () => {
    const warn = vi.spyOn(console, 'warn');
    await request(rawApp(verifierReturning(grantedScopes(['widgets.orders']))))
      .put('/blobs/abc')
      .set('x-api-key', KEY);

    expect(warn.mock.calls.flat().join(' ')).toContain('widgets.blobs.upload');
  });

  it('401 a key the registry rejects, and 503 when it cannot be asked', async () => {
    const rejected = await request(rawApp(verifierReturning({ outcome: 'rejected' })))
      .get('/blobs/abc')
      .set('x-api-key', KEY);
    const unavailable = await request(
      rawApp(verifierReturning({ outcome: 'unavailable', detail: 'ECONNREFUSED' }))
    )
      .get('/blobs/abc')
      .set('x-api-key', KEY);

    expect(rejected.status).toBe(401);
    expect(unavailable.status).toBe(503);
  });

  it('admit a request with no key under the default posture, as a contract route would', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const response = await request(rawApp(verify)).put('/blobs/abc');

    expect(response.status).toBe(201);
    expect(verify).not.toHaveBeenCalled();
  });

  it('401 a request with no key when the pillar requires a credential, as a contract route would', async () => {
    const response = await request(rawApp(verifierReturning({ outcome: 'rejected' }), true)).get(
      '/blobs/abc'
    );

    expect(response.status).toBe(401);
  });

  it('leave a raw path nobody declared untouched, even under a rejected key', async () => {
    const response = await request(rawApp(verifierReturning({ outcome: 'rejected' })))
      .get('/undeclared/abc')
      .set('x-api-key', KEY);

    expect(response.status).toBe(200);
  });

  it('refuse a declaration the contract already covers, whose scope could never apply', () => {
    expect(() =>
      createServiceAccountScopeGate({
        contract,
        rootScope: 'widgets',
        logPrefix: 'widgets-api',
        rawRoutes: { shadow: { get: { method: 'get', path: '/orders/:orderId' } } },
      })
    ).toThrow(/widgets\.orders\.get/);
  });

  it('refuse a declaration that projects to no route at all', () => {
    expect(() =>
      createServiceAccountScopeGate({
        contract,
        rootScope: 'widgets',
        logPrefix: 'widgets-api',
        rawRoutes: {},
      })
    ).toThrow(/widgets-api/);
  });
});
