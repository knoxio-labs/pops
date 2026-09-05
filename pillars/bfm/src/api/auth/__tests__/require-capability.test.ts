/**
 * The capability gate, driven through the real app wherever a refusal is the
 * subject, and through the middleware directly for the two branches the
 * shipped contract cannot reach.
 *
 * The distinction matters. "A device without the capability is refused" is a
 * fact about the perimeter and has to be proved against the perimeter — a unit
 * test of the middleware would pass just as happily if `app.ts` never mounted
 * it. "A mobile route declaring no capability is a fault" cannot be proved
 * that way at all, because the contract guard exists to make that state
 * impossible, so it is driven with a doctored contract instead.
 */
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_DEVICE_CAPABILITIES,
  MOBILE_SESSION_CAPABILITY,
  serialiseDeviceCapabilities,
} from '../../../contract/capabilities.js';
import { MobileForbiddenErrorSchema } from '../../../contract/rest-schemas.js';
import { deviceRow } from '../../../db/__tests__/helpers.js';
import { devices } from '../../../db/index.js';
import { createTestApp, type TestApp } from '../../__tests__/harness.js';
import { requestOn } from '../../__tests__/test-http.js';
import { mintAccessToken } from '../access-token.js';
import {
  buildMobileRouteGates,
  createRequireCapability,
  UndeclaredMobileRouteError,
} from '../require-capability.js';

import type { Request, Response } from 'express';

const apps: TestApp[] = [];

function open(): TestApp {
  const app = createTestApp();
  apps.push(app);
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (apps.length > 0) apps.pop()?.cleanup();
});

function pairedDevice(
  app: TestApp,
  capabilities: readonly string[]
): { id: string; authorization: string } {
  const row = deviceRow({ capabilities: serialiseDeviceCapabilities(capabilities) });
  app.db.insert(devices).values(row).run();
  const { token } = mintAccessToken(row.id, app.accessTokenSigningKey);
  return { id: row.id, authorization: `Bearer ${token}` };
}

describe('a device asking for something its grant does not cover', () => {
  it('is refused with 403 capability_not_granted, not 401 and not 404', async () => {
    const app = open();
    const device = pairedDevice(app, [MOBILE_SESSION_CAPABILITY]);

    const res = await requestOn(app.app, (r) =>
      r.get('/mobile/finance/transactions').set('Authorization', device.authorization)
    );

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      code: 'capability_not_granted',
      message: expect.any(String),
      capability: 'finance.transactions.read',
    });
  });

  it('answers a body the contract describes, so the generated client can decode it', async () => {
    const app = open();
    const device = pairedDevice(app, [MOBILE_SESSION_CAPABILITY]);

    const res = await requestOn(app.app, (r) =>
      r.get('/mobile/finance/transactions').set('Authorization', device.authorization)
    );

    expect(MobileForbiddenErrorSchema.safeParse(res.body).success).toBe(true);
  });

  it('names what the route needed and never what the grant holds', async () => {
    // A refusal enumerating the grant would hand whoever provoked it a map of
    // everything else the handset can do.
    const app = open();
    const device = pairedDevice(app, [MOBILE_SESSION_CAPABILITY, 'purchases.receipts.write']);

    const res = await requestOn(app.app, (r) =>
      r.get('/mobile/finance/transactions').set('Authorization', device.authorization)
    );

    expect(JSON.stringify(res.body)).not.toContain('purchases.receipts.write');
  });

  it('refuses the write route on the same terms as a read one', async () => {
    const app = open();
    const device = pairedDevice(app, [MOBILE_SESSION_CAPABILITY]);

    const res = await requestOn(app.app, (r) =>
      r
        .post('/mobile/purchases/receipts')
        .set('Authorization', device.authorization)
        .send({ parts: [{ mediaType: 'image/jpeg', dataBase64: 'AAAA' }] })
    );

    expect(res.status).toBe(403);
    expect(res.body.capability).toBe('purchases.receipts.write');
  });

  it('refuses an empty grant everywhere, including bootstrap', async () => {
    const app = open();
    const device = pairedDevice(app, []);

    const res = await requestOn(app.app, (r) =>
      r.get('/mobile/bootstrap').set('Authorization', device.authorization)
    );

    expect(res.status).toBe(403);
    expect(res.body.capability).toBe(MOBILE_SESSION_CAPABILITY);
  });

  it('reads an unparseable grant as no grant rather than as no restriction', async () => {
    const app = open();
    const row = deviceRow({ capabilities: 'not json at all' });
    app.db.insert(devices).values(row).run();
    const { token } = mintAccessToken(row.id, app.accessTokenSigningKey);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const res = await requestOn(app.app, (r) =>
      r.get('/mobile/bootstrap').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(403);
    warn.mockRestore();
  });

  it('lets a device holding the capability through', async () => {
    const app = open();
    const device = pairedDevice(app, DEFAULT_DEVICE_CAPABILITIES);

    const res = await requestOn(app.app, (r) =>
      r.get('/mobile/finance/transactions').set('Authorization', device.authorization)
    );

    // The finance leg is deliberately unreachable in the harness, so getting
    // past the gate is an upstream failure rather than a 200 — which is the
    // point: the refusal it is NOT is the 403.
    expect(res.status).not.toBe(403);
  });

  it('reaches a capability added after it paired, when it tracks the default grant', async () => {
    // The row a handset paired in 2026-08 carries: the vocabulary of that day,
    // with no `finance.accounts.read` in it. The gate must resolve the grant
    // against the running build rather than against the column, or the app
    // offers an Accounts tab that answers 403 (POPS-2928).
    const app = open();
    const row = deviceRow({
      capabilities: serialiseDeviceCapabilities([
        MOBILE_SESSION_CAPABILITY,
        'finance.transactions.read',
        'purchases.receipts.write',
      ]),
      capabilityMode: 'tracks-default',
    });
    app.db.insert(devices).values(row).run();
    const { token } = mintAccessToken(row.id, app.accessTokenSigningKey);

    const res = await requestOn(app.app, (r) =>
      r.get('/mobile/finance/accounts').set('Authorization', `Bearer ${token}`)
    );

    // The finance leg is unreachable in the harness, so past the gate is an
    // upstream failure rather than a 200 — the refusal it is NOT is the 403.
    expect(res.status).not.toBe(403);
  });

  it('still refuses a capability an explicit grant omits, however wide the default set is', async () => {
    // The other direction of the same change: re-resolving must not undo a
    // narrowing. This grant names the session capability and nothing else,
    // while the default set holds `finance.accounts.read`.
    const app = open();
    const device = pairedDevice(app, [MOBILE_SESSION_CAPABILITY]);

    const res = await requestOn(app.app, (r) =>
      r.get('/mobile/finance/accounts').set('Authorization', device.authorization)
    );

    expect(res.status).toBe(403);
    expect(res.body.capability).toBe('finance.accounts.read');
  });

  it('does not gate a path the contract never declared', async () => {
    // A typo must reach the router's own 404. Refusing here would make every
    // wrong path read as a permissions problem.
    const app = open();
    const device = pairedDevice(app, []);

    const res = await requestOn(app.app, (r) =>
      r.get('/mobile/nothing-here').set('Authorization', device.authorization)
    );

    expect(res.status).toBe(404);
  });
});

describe('the route table it derives', () => {
  it('finds every mobile route and no operator or device one', () => {
    const gates = buildMobileRouteGates({
      mobile: { a: { method: 'GET', path: '/mobile/a', metadata: { capability: 'session.read' } } },
      operator: { b: { method: 'GET', path: '/operator/b' } },
      device: { c: { method: 'POST', path: '/devices/pair' } },
    });

    expect(gates.map((gate) => gate.path)).toEqual(['/mobile/a']);
  });

  it('does not let a parameterised route swallow its own collection', () => {
    const gates = buildMobileRouteGates({
      list: { method: 'GET', path: '/mobile/x', metadata: { capability: 'session.read' } },
      one: { method: 'GET', path: '/mobile/x/:id', metadata: { capability: 'session.read' } },
    });

    const [collection, item] = gates;
    expect(collection?.pattern.test('/mobile/x')).toBe(true);
    expect(collection?.pattern.test('/mobile/x/abc')).toBe(false);
    expect(item?.pattern.test('/mobile/x/abc')).toBe(true);
    expect(item?.pattern.test('/mobile/x/abc/extra')).toBe(false);
    // An empty segment is not an id. `/mobile/x/` must not read as one.
    expect(item?.pattern.test('/mobile/x/')).toBe(false);
  });

  it('does not let a dot in a literal segment match anything else', () => {
    const gates = buildMobileRouteGates({
      one: { method: 'GET', path: '/mobile/a.b', metadata: { capability: 'session.read' } },
    });

    expect(gates[0]?.pattern.test('/mobile/axb')).toBe(false);
    expect(gates[0]?.pattern.test('/mobile/a.b')).toBe(true);
  });
});

describe('a mobile route that declares nothing', () => {
  /**
   * Unreachable through `bfmContract` — the contract guard fails first — so it
   * is driven with a doctored one. The branch has to exist and has to be
   * proved anyway: "no capability declared" must never be readable as "no
   * capability required", and that is a decision made in this file rather than
   * in the contract.
   */
  it('is a fault, raised as one, never served', async () => {
    const middleware = createRequireCapability({
      undeclared: { method: 'GET', path: '/mobile/undeclared' },
    });

    const app = express();
    let captured: unknown;
    app.use('/mobile', middleware);
    app.use((error: unknown, _req: Request, res: Response, _next: unknown) => {
      captured = error;
      res.status(500).json({ ok: false });
    });

    const res = await requestOn(app, (r) => r.get('/mobile/undeclared'));

    expect(res.status).toBe(500);
    expect(captured).toBeInstanceOf(UndeclaredMobileRouteError);
  });

  it('is a fault for a capability outside the vocabulary too', async () => {
    const middleware = createRequireCapability({
      invented: { method: 'GET', path: '/mobile/invented', metadata: { capability: 'media.wipe' } },
    });

    const app = express();
    app.use('/mobile', middleware);
    app.use((_error: unknown, _req: Request, res: Response, _next: unknown) => {
      res.status(500).json({ ok: false });
    });

    const res = await requestOn(app, (r) => r.get('/mobile/invented'));

    expect(res.status).toBe(500);
  });
});
