/**
 * A shared, pre-listened supertest transport for the orchestrator app suites.
 *
 * Same diagnosis and same fix as `pillars/finance/src/api/__tests__/test-utils.ts`,
 * `pillars/bfm/src/api/__tests__/test-http.ts`,
 * `pillars/purchases/src/api/__tests__/test-http.ts`,
 * `pillars/media/src/api/__tests__/test-http.ts`,
 * `pillars/cerebrum/src/api/__tests__/test-http.ts`,
 * `pillars/documents/src/api/__tests__/test-http.ts`,
 * `pillars/ai/src/api/__tests__/test-http.ts`,
 * `pillars/food/src/api/__tests__/test-http.ts` and
 * `pillars/inventory/src/api/__tests__/test-http.ts`. Read finance's header
 * first — it carries the netstat evidence — and put a change to the diagnosis
 * in all of them.
 *
 * It lives in `src/__tests__/` rather than `src/api/__tests__/` because this
 * pillar keeps its app factory at `src/app.ts` and its suites beside it.
 *
 * Handed a bare Express app, supertest binds a fresh ephemeral server to the
 * `::` wildcard for every single call, and superagent dials it with a fresh
 * connection because it defaults to `agent: false`: two ephemeral ports
 * burned per request. Measured on this pillar's own app before this file
 * existed, ten sequential `/health` calls produced ten distinct listening
 * ports and ten distinct client sockets; through this transport the same ten
 * produce one of each.
 *
 * Under real machine contention that churn surfaces two ways: a request
 * descheduled past vitest's 5s default, and — rarer, and the more telling —
 * a response carrying a status no code path in the app under test can
 * produce, when a connection outlives the ephemeral server it belonged to and
 * lands on whatever bound the same port next. No sighting has been recorded
 * against orchestrator; it is converted because it was on bare supertest,
 * which is the shared cause behind the sightings the other pillars did file.
 *
 * One server per test file instead: pre-listened, bound explicitly to
 * `127.0.0.1` (a `::`-bound server does not own the IPv4 loopback tuple
 * supertest dials), plus one pooled keep-alive agent so a sequence of
 * requests reuses a single connection rather than opening one each time.
 *
 * Every orchestrator suite builds its app inside the test body —
 * `makeApp(reader(…))` per assertion, each with its own snapshot reader — so
 * app identity travels in a header the shared server routes on rather than
 * resting on a "most recently bound app" global, which interleaved calls
 * would race.
 *
 * `test-http.test.ts` is the deterministic guard on all of that, and its
 * header says how to watch each assertion fail.
 *
 * This is a parallel implementation, not a shared import — the pillars keep
 * their own copy the same way each keeps its own DB opener (see AGENTS.md,
 * "Conventions duplicated per pillar").
 */
import { once } from 'node:events';
import http from 'node:http';

import supertest from 'supertest';
import { afterAll, beforeAll } from 'vitest';

import type { RequestListener } from 'node:http';

const APP_HEADER = 'x-pops-test-app';

const keepAliveAgent = new http.Agent({ keepAlive: true });

/**
 * Re-exported so the pillar's helpers can name a request without importing
 * `supertest` themselves — the transport is the one file allowed to.
 */
export type Test = supertest.Test;

/** The verbs the orchestrator suites actually issue. */
export interface BoundAgent {
  get(url: string): supertest.Test;
  post(url: string): supertest.Test;
}

export interface TestTransport {
  /** Issue requests against `app` over this file's shared server. */
  requestOn(app: RequestListener): BoundAgent;
}

function boundAddress(server: http.Server): string | null {
  const address = server.address();
  return typeof address === 'object' && address !== null ? address.address : null;
}

/**
 * Register the file's shared server with vitest's `beforeAll`/`afterAll`, so
 * call this at module scope.
 */
export function createTestTransport(): TestTransport {
  const appsById = new Map<string, RequestListener>();
  const idsByApp = new WeakMap<RequestListener, string>();
  let nextId = 0;

  const server = http.createServer((req, res) => {
    const id = req.headers[APP_HEADER];
    const app = typeof id === 'string' ? appsById.get(id) : undefined;
    if (app === undefined) {
      res.statusCode = 500;
      res.end('orchestrator test transport: the request named no registered app');
      return;
    }
    app(req, res);
  });

  beforeAll(async () => {
    await once(server.listen(0, '127.0.0.1'), 'listening');
    const address = boundAddress(server);
    if (address !== '127.0.0.1') {
      throw new Error(`orchestrator test server must bind 127.0.0.1, got ${address ?? 'null'}`);
    }
  });

  /**
   * Node >=19 pools keep-alive sockets, and `server.close()` alone can wait
   * out the server's 5s `keepAliveTimeout` for a socket it failed to flag
   * idle. Every response is fully awaited before teardown, so destroying the
   * remaining sockets is safe.
   */
  afterAll(async () => {
    keepAliveAgent.destroy();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
  });

  function idFor(app: RequestListener): string {
    const known = idsByApp.get(app);
    if (known !== undefined) return known;
    nextId += 1;
    const id = String(nextId);
    idsByApp.set(app, id);
    appsById.set(id, app);
    return id;
  }

  return {
    requestOn(app) {
      const id = idFor(app);
      const route = (test: supertest.Test): supertest.Test =>
        test.set(APP_HEADER, id).agent(keepAliveAgent);
      return {
        get: (url) => route(supertest(server).get(url)),
        post: (url) => route(supertest(server).post(url)),
      };
    },
  };
}
