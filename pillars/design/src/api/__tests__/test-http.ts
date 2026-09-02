/**
 * A shared, pre-listened supertest transport for this pillar's API suites.
 *
 * Mirrors `pillars/bfm/src/api/__tests__/test-http.ts` — read its header
 * before editing either. supertest's own `request(app)` binds a fresh
 * ephemeral server per call on the `::` wildcard, and that bind/connect/close
 * churn is what macOS's loopback allocator stalls on, surfacing as random
 * timeouts or, worse, a response from a server the connection outlived. One
 * unref'd server per test file bound explicitly to `127.0.0.1` instead, with
 * a keep-alive agent so requests reuse a pooled connection.
 *
 * A parallel implementation rather than a shared import, the same way each
 * pillar keeps its own DB opener (AGENTS.md, "Conventions duplicated per
 * pillar"). This pillar's suites never race two different apps, so it needs
 * no dedicated-server fallback.
 */
import { once } from 'node:events';
import http from 'node:http';

import supertest from 'supertest';

import type { AddressInfo } from 'node:net';

import type { Express } from 'express';

const keepAliveAgent = new http.Agent({ keepAlive: true });

type Agent = ReturnType<typeof supertest>;

let sharedServer: Promise<http.Server> | null = null;
let dispatchApp: Express | null = null;

async function listenOnLoopback(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    if (dispatchApp) {
      dispatchApp(req, res);
      return;
    }
    res.statusCode = 500;
    res.end('no app bound to the shared design test server');
  });
  await once(server.listen(0, '127.0.0.1'), 'listening');
  const address = server.address() as AddressInfo | null;
  if (address?.address !== '127.0.0.1') {
    server.close();
    throw new Error(`design test server must bind 127.0.0.1, got ${address?.address ?? 'null'}`);
  }
  server.unref();
  return server;
}

/**
 * Issue one request against `app` over the shared server and return the raw
 * supertest response. Every suite here asserts on status and body directly,
 * so this one primitive covers all of them.
 */
export async function requestOn(
  app: Express,
  build: (agent: Agent) => supertest.Test
): Promise<supertest.Response> {
  dispatchApp = app;
  sharedServer ??= listenOnLoopback();
  const server = await sharedServer;
  const { port } = server.address() as AddressInfo;
  return build(supertest(`http://127.0.0.1:${port}`)).agent(keepAliveAgent);
}
