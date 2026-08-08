/**
 * The property this module exists to buy: one persistent, `127.0.0.1`-bound
 * server per file, not one ephemeral `::`-bound listener per call.
 *
 * These assertions are deterministic, not a reproduction of the load-induced
 * stall itself — that only shows up under real machine contention (see the
 * file header on `test-http.ts`). What is deterministic, and what the fix
 * actually changes, is the number of TCP listeners a sequence of requests
 * opens. Point these tests at bare `supertest(app)` instead of `requestOn`
 * and the port-stability assertion fails immediately: two sequential ephemeral
 * `listen(0)` calls essentially never draw the same port twice.
 */
import express, { type Express } from 'express';
import { describe, expect, it } from 'vitest';

import { requestOn } from './test-http.js';

function echoingApp(seenPorts: number[], seenAddresses: string[]): Express {
  const app = express();
  app.get('/ping', (req, res) => {
    seenPorts.push(req.socket.localPort);
    seenAddresses.push(req.socket.localAddress ?? '');
    res.status(200).json({ ok: true });
  });
  return app;
}

describe('requestOn', () => {
  it('dispatches every call through the same listening port', async () => {
    const seenPorts: number[] = [];
    const app = echoingApp(seenPorts, []);

    await requestOn(app, (r) => r.get('/ping'));
    await requestOn(app, (r) => r.get('/ping'));
    await requestOn(app, (r) => r.get('/ping'));

    expect(seenPorts).toHaveLength(3);
    expect(new Set(seenPorts).size).toBe(1);
    expect(seenPorts[0]).toBeGreaterThan(0);
  });

  it('binds the shared server to 127.0.0.1, not the wildcard address', async () => {
    const seenAddresses: string[] = [];
    const app = echoingApp([], seenAddresses);

    await requestOn(app, (r) => r.get('/ping'));

    expect(seenAddresses).toEqual(['127.0.0.1']);
  });

  it('still answers correctly when two apps interleave across calls', async () => {
    const firstApp = express();
    firstApp.get('/who', (_req, res) => res.status(200).json({ app: 'first' }));
    const secondApp = express();
    secondApp.get('/who', (_req, res) => res.status(200).json({ app: 'second' }));

    const first = await requestOn(firstApp, (r) => r.get('/who'));
    const second = await requestOn(secondApp, (r) => r.get('/who'));
    const firstAgain = await requestOn(firstApp, (r) => r.get('/who'));

    expect(first.body).toEqual({ app: 'first' });
    expect(second.body).toEqual({ app: 'second' });
    expect(firstAgain.body).toEqual({ app: 'first' });
  });

  it('races concurrent requests against one already-bound app without cross-talk', async () => {
    const app = express();
    app.get('/echo/:value', (req, res) => {
      res.status(200).json({ value: req.params.value });
    });

    const responses = await Promise.all(
      ['a', 'b', 'c'].map((value) => requestOn(app, (r) => r.get(`/echo/${value}`)))
    );

    expect(responses.map((res) => res.body.value)).toEqual(['a', 'b', 'c']);
  });
});
