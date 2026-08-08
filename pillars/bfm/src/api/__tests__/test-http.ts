/**
 * A shared, pre-listened supertest transport for bfm's API suites.
 *
 * Mirrors the diagnosis in `pillars/finance/src/api/__tests__/test-utils.ts`
 * (see its header): supertest's own `request(app)` binds a fresh ephemeral
 * server to the `::` wildcard — not `127.0.0.1` — and dials it with a fresh
 * connection for every single call, two ephemeral ports burned per request.
 * Under real machine contention, that bind/connect/close churn is what
 * macOS's loopback allocator stalls on, surfacing as random
 * `Test timed out in 5000ms` failures, or — rarer, and the more telling
 * symptom — a response carrying a status no code path in the app under test
 * can produce, when a connection outlives the ephemeral server it belonged
 * to and lands on whatever bound the same port next.
 *
 * One server per test file instead: pre-listened, bound explicitly to
 * `127.0.0.1`, dispatching to whichever app the most recent call bound, plus
 * one keep-alive agent so requests reuse a pooled connection rather than
 * opening a fresh one each time. Unref'd and never closed: vitest's per-file
 * module isolation scopes it to the file, and worker teardown reclaims it.
 *
 * This is a parallel implementation of finance's primitive, not a shared
 * import — the two pillars deliberately keep their own copy of this pattern
 * the same way each pillar keeps its own DB opener (see AGENTS.md,
 * "Conventions duplicated per pillar"). Read finance's header before editing
 * either; a change to the diagnosis belongs in both.
 */
import { once } from 'node:events';
import http from 'node:http';

import supertest from 'supertest';

import type { AddressInfo } from 'node:net';

import type { Express } from 'express';

export const keepAliveAgent = new http.Agent({ keepAlive: true });

type Agent = ReturnType<typeof supertest>;

/**
 * Node ≥19 pools keep-alive sockets, and `server.close()` alone can wait out
 * the server's 5s `keepAliveTimeout` for a socket it failed to flag idle.
 * Every response is fully awaited before teardown, so destroying the
 * remaining sockets is safe.
 */
const closeServer = (server: http.Server): Promise<void> =>
  new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });

async function listenOnLoopback(handler: http.RequestListener): Promise<http.Server> {
  const server = http.createServer(handler);
  await once(server.listen(0, '127.0.0.1'), 'listening');
  const addr = server.address() as AddressInfo | null;
  if (addr?.address !== '127.0.0.1') {
    await closeServer(server);
    throw new Error(`bfm test server must bind 127.0.0.1, got ${addr?.address ?? 'null'}`);
  }
  return server;
}

let sharedServer: Promise<http.Server> | null = null;
let dispatchApp: Express | null = null;
let inFlight = 0;

async function onDedicatedServer<R>(app: Express, fn: (agent: Agent) => Promise<R>): Promise<R> {
  const server = await listenOnLoopback(app);
  try {
    return await fn(supertest(server));
  } finally {
    await closeServer(server);
  }
}

/**
 * Run `fn` against the file's shared `127.0.0.1` server. Requests dispatch to
 * the most recently bound app — safe because every call site awaits its
 * request before issuing the next, except the deliberately-concurrent
 * `Promise.all` groups in `device-refresh.test.ts`, which always race
 * requests against one already-bound app rather than switching apps
 * mid-flight. A concurrent call that *does* carry a different app than the
 * one in flight falls back to a dedicated throwaway server, so a request can
 * never be routed to the wrong app.
 */
async function onServer<R>(app: Express, fn: (agent: Agent) => Promise<R>): Promise<R> {
  if (inFlight > 0 && dispatchApp !== app) return onDedicatedServer(app, fn);
  dispatchApp = app;
  inFlight++;
  try {
    sharedServer ??= listenOnLoopback((req, res) => {
      if (dispatchApp) {
        dispatchApp(req, res);
        return;
      }
      res.statusCode = 500;
      res.end('no app bound to the shared bfm test server');
    }).then((server) => {
      server.unref();
      return server;
    });
    const server = await sharedServer;
    return await fn(supertest(server));
  } finally {
    inFlight--;
  }
}

/**
 * Issue one request against the shared `127.0.0.1` server and return the raw
 * supertest response. Every bfm test asserts on status/headers/body directly
 * rather than through a typed per-route client, so this one primitive covers
 * the whole suite — there is no `makeClient`-style wrapper to also migrate.
 */
export const requestOn = (
  app: Express,
  build: (agent: Agent) => supertest.Test
): Promise<supertest.Response> =>
  onServer(app, async (agent) => build(agent).agent(keepAliveAgent));
