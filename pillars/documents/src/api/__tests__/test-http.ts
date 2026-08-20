/**
 * A shared, pre-listened supertest transport for the documents API suites.
 *
 * Same diagnosis and same fix as `pillars/finance/src/api/__tests__/test-utils.ts`,
 * `pillars/bfm/src/api/__tests__/test-http.ts`,
 * `pillars/purchases/src/api/__tests__/test-http.ts`,
 * `pillars/media/src/api/__tests__/test-http.ts` and
 * `pillars/cerebrum/src/api/__tests__/test-http.ts`. Read finance's header
 * first — it carries the netstat evidence — and put a change to the diagnosis
 * in all of them.
 *
 * Handed a bare Express app, supertest binds a fresh ephemeral server to the
 * `::` wildcard for every single call, and superagent dials it with a fresh
 * connection because it defaults to `agent: false`: two ephemeral ports
 * burned per request. Under real machine contention that churn is what
 * macOS's loopback allocator stalls on, and the way this pillar has seen it
 * is a mocked-dependency test starving past vitest's 5s default while the
 * rest of the workspace suite ran in parallel — green in isolation, and with
 * the whole file set finishing well inside the budget the one test missed.
 *
 * One server per test file instead: pre-listened, bound explicitly to
 * `127.0.0.1` (a `::`-bound server does not own the IPv4 loopback tuple
 * supertest dials), plus one pooled keep-alive agent so a sequence of
 * requests reuses a single connection rather than opening one each time.
 *
 * App identity travels in a header the shared server routes on rather than
 * resting on a "most recently bound app" global: every suite here builds its
 * app inside the test body, so identity has to survive interleaving rather
 * than rest on every call site happening to await before the next one begins.
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
 * The documents API suites are read-only today, so `get` is the whole
 * surface. Add a verb here when a suite needs one rather than reaching back
 * for bare `supertest(app)`.
 */
export interface BoundAgent {
  get(url: string): supertest.Test;
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
      res.end('documents test transport: the request named no registered app');
      return;
    }
    app(req, res);
  });

  beforeAll(async () => {
    await once(server.listen(0, '127.0.0.1'), 'listening');
    const address = boundAddress(server);
    if (address !== '127.0.0.1') {
      throw new Error(`documents test server must bind 127.0.0.1, got ${address ?? 'null'}`);
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
      return {
        get: (url) => supertest(server).get(url).set(APP_HEADER, id).agent(keepAliveAgent),
      };
    },
  };
}
