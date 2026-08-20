/**
 * The properties `test-http.ts` exists to buy: one persistent, `127.0.0.1`
 * bound server per file rather than one ephemeral `::`-bound listener per
 * call, one pooled client connection rather than a fresh one per call, and
 * app identity carried per request rather than held in a mutable global.
 *
 * These assertions are deterministic. They do not reproduce the load-induced
 * stall itself — that needs a genuinely oversubscribed box (see the header on
 * `test-http.ts`) — they pin the mechanical facts the fix changes. Each one
 * has a way to watch it fail:
 *
 * - point the first test at bare `supertest(app)` and the listening-port
 *   assertion fails immediately: two sequential ephemeral `listen(0)` calls
 *   essentially never draw the same port twice;
 * - drop `.agent(keepAliveAgent)` from `route()` and the client-connection
 *   assertion fails: superagent defaults to `agent: false`, one fresh TCP
 *   connection and one fresh client port per request;
 * - swap `'127.0.0.1'` for the wildcard in `server.listen(0, …)` and the
 *   bound-address assertion fails;
 * - replace the header dispatch with a module-global "most recently bound
 *   app" — set on every `requestOn` call, not only on first registration —
 *   and two tests fail: the concurrency one, where three in-flight requests
 *   all come back from whichever app was bound last, and the last one in the
 *   file, because a global has no registration to refuse. The sequential
 *   interleaving test survives that swap — every call there awaits before the
 *   next begins, so the global happens to be right — which is why both
 *   interleaving tests exist;
 * - drop `.set(APP_HEADER, id)` from any single verb in the returned table and
 *   the verb test fails on that verb with the transport's own 500.
 *
 * The interleaving tests matter here because lists' suites build their app
 * inside the test body — `makeApp()` per test, and one inline
 * `buildApp(raw, db)` — so the transport is handed a distinct app on nearly
 * every call.
 */
import express, { type Express } from 'express';
import { describe, expect, it } from 'vitest';

import { createTestTransport } from './test-http.js';

const { requestOn } = createTestTransport();

interface Seen {
  localPorts: number[];
  localAddresses: string[];
  remotePorts: number[];
}

function seen(): Seen {
  return { localPorts: [], localAddresses: [], remotePorts: [] };
}

function recordingApp(into: Seen): Express {
  const app = express();
  app.get('/ping', (req, res) => {
    const { localPort, remotePort } = req.socket;
    if (localPort === undefined || remotePort === undefined) {
      throw new Error('a live request socket has no port');
    }
    into.localPorts.push(localPort);
    into.localAddresses.push(req.socket.localAddress ?? '');
    into.remotePorts.push(remotePort);
    res.status(200).json({ ok: true });
  });
  return app;
}

function answeringApp(name: string): Express {
  const app = express();
  app.all('/who', (req, res) => {
    res.status(200).json({ app: name, method: req.method });
  });
  return app;
}

describe('requestOn', () => {
  it('dispatches every call through the same listening port', async () => {
    const observed = seen();
    const app = recordingApp(observed);

    await requestOn(app).get('/ping');
    await requestOn(app).get('/ping');
    await requestOn(app).get('/ping');

    expect(observed.localPorts).toHaveLength(3);
    expect(new Set(observed.localPorts).size).toBe(1);
    expect(observed.localPorts[0]).toBeGreaterThan(0);
  });

  it('reuses one pooled client connection instead of dialling a fresh one per call', async () => {
    const observed = seen();
    const app = recordingApp(observed);

    await requestOn(app).get('/ping');
    await requestOn(app).get('/ping');
    await requestOn(app).get('/ping');

    expect(observed.remotePorts).toHaveLength(3);
    expect(new Set(observed.remotePorts).size).toBe(1);
  });

  it('binds the shared server to 127.0.0.1, not the wildcard address', async () => {
    const observed = seen();

    await requestOn(recordingApp(observed)).get('/ping');

    expect(observed.localAddresses).toEqual(['127.0.0.1']);
  });

  it('still answers correctly when two apps interleave across calls', async () => {
    const first = answeringApp('first');
    const second = answeringApp('second');

    const one = await requestOn(first).get('/who');
    const two = await requestOn(second).get('/who');
    const three = await requestOn(first).get('/who');

    expect(one.body).toMatchObject({ app: 'first' });
    expect(two.body).toMatchObject({ app: 'second' });
    expect(three.body).toMatchObject({ app: 'first' });
  });

  it('routes concurrent requests to their own app rather than to whichever was bound last', async () => {
    const apps = ['a', 'b', 'c'].map((name) => answeringApp(name));

    const responses = await Promise.all(apps.map((app) => requestOn(app).get('/who')));

    expect(responses.map((response) => response.body.app)).toEqual(['a', 'b', 'c']);
  });

  it('carries app identity on every verb it exposes, not only GET', async () => {
    const agent = requestOn(answeringApp('every-verb'));

    const responses = await Promise.all([
      agent.get('/who'),
      agent.post('/who'),
      agent.patch('/who'),
      agent.delete('/who'),
    ]);

    expect(responses.map((response) => response.body)).toEqual([
      { app: 'every-verb', method: 'GET' },
      { app: 'every-verb', method: 'POST' },
      { app: 'every-verb', method: 'PATCH' },
      { app: 'every-verb', method: 'DELETE' },
    ]);
  });

  it('refuses a request that names no registered app rather than guessing one', async () => {
    const response = await requestOn(answeringApp('registered'))
      .get('/who')
      .set('x-pops-test-app', 'not-a-registered-id');

    expect(response.status).toBe(500);
    expect(response.text).toContain('named no registered app');
  });
});
