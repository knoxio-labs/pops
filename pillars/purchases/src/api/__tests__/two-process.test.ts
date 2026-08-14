/**
 * purchases-api as its own process, talking to a registry and a finance
 * over a real socket.
 *
 * Every other test in this pillar runs the server in-process: supertest
 * hands a request object straight to Express, and even the real-HTTP
 * finance test serves its fake from the same Node process as the client
 * calling it. That leaves a whole class untested — boot, env parsing,
 * migrations on a fresh file, the sweep runner starting, and cross-pillar
 * discovery — all of which fail at deploy time rather than in a suite.
 *
 * This spawns the real entry point (`src/api/server.ts`) with the
 * environment a deployment gives it, and drives it entirely over HTTP.
 *
 * It is the runnable half of `infra/smoke/purchases-reconcile.sh`. The
 * script additionally proves the Docker network and the compose file; this
 * proves everything upstream of them, and unlike the script it runs in CI.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

let registry: Server;
let registryUrl: string;
let purchases: ChildProcess;
let purchasesUrl: string;
let dataDir: string;

/** The one transaction the fake finance publishes. */
const TRANSACTION = {
  id: 'txn-smoke-1',
  description: 'AMAZON MKTPLACE AU SMOKE',
  account: 'smoke',
  amount: 41.28,
  date: '2026-03-06',
  type: 'purchase',
  entityId: null,
  entityName: null,
};

const ORDER_TOTAL_CENTS = 4128;

/**
 * The service-account key the spawned process is deployed with. A throwaway
 * literal — never a real one in a fixture.
 */
const SERVICE_ACCOUNT_KEY = 'pops_sa_TWOPROC.testsecret_not_a_real_key_00000';

/** `x-api-key` on every `GET /transactions` the spawned process issued. */
const financeCallKeys: (string | string[] | undefined)[] = [];

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return `http://127.0.0.1:${String(address.port)}`;
}

/** Reserve an ephemeral port, then release it for the child to bind. */
async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => {
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const { port } = address;
  await new Promise<void>((resolve) => {
    probe.close(() => {
      resolve();
    });
  });
  return port;
}

async function waitForHealth(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`purchases-api never became healthy at ${url}`);
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'purchases-2p-'));

  // A registry that also serves finance's OpenAPI and transactions, so the
  // spawned process resolves a real peer over a real socket.
  registry = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    res.setHeader('content-type', 'application/json');

    if (url.pathname === '/registry/pillars') {
      res.end(
        JSON.stringify({
          pillars: [
            {
              pillarId: 'finance',
              baseUrl: registryUrl,
              status: 'healthy',
              manifest: { contract: { version: '0.1.0' } },
              lastSeenAt: '2026-03-04T00:00:00.000Z',
              registered: true,
            },
          ],
        })
      );
      return;
    }

    if (url.pathname === '/openapi') {
      res.end(
        JSON.stringify({
          openapi: '3.0.3',
          info: { title: 'finance', version: '0.1.0' },
          paths: {
            '/transactions': {
              get: {
                operationId: 'transactions.list',
                parameters: ['search', 'startDate', 'endDate', 'limit', 'offset'].map((name) => ({
                  name,
                  in: 'query',
                  required: false,
                  schema: { type: 'string' },
                })),
                responses: { '200': { description: 'ok' } },
              },
            },
          },
        })
      );
      return;
    }

    if (url.pathname === '/transactions') {
      financeCallKeys.push(req.headers['x-api-key']);
      res.end(
        JSON.stringify({
          data: [TRANSACTION],
          pagination: { total: 1, limit: 500, offset: 0, hasMore: false },
        })
      );
      return;
    }

    res.statusCode = 404;
    res.end('{}');
  });
  registryUrl = await listen(registry);

  // The server validates PORT as 1-65535, so 0 is not a way to ask for an
  // ephemeral one — reserve a real port and hand it over.
  const port = await freePort();

  purchases = spawn('npx', ['tsx', 'src/api/server.ts'], {
    cwd: packageRoot,
    env: {
      ...process.env,
      PORT: String(port),
      PURCHASES_SQLITE_PATH: join(dataDir, 'purchases.db'),
      POPS_REGISTRY_URL: registryUrl,
      POPS_REGISTRY_ENABLED: 'false',
      // The deployment supplies one; without it every outbound leg reports
      // `no-credential` and the sweep below writes nothing at all.
      POPS_INTERNAL_API_KEY: SERVICE_ACCOUNT_KEY,
      // Seconds, not minutes: the sweep has to tick inside the test.
      PURCHASES_SWEEP_COALESCE_MS: '500',
      PURCHASES_SWEEP_POLL_MS: '1000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const childOutput: string[] = [];
  purchases.stdout?.on('data', (chunk: Buffer) => childOutput.push(chunk.toString()));
  purchases.stderr?.on('data', (chunk: Buffer) => childOutput.push(chunk.toString()));
  purchases.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`purchases-api exited ${String(code)}:\n${childOutput.join('')}`);
    }
  });

  purchasesUrl = `http://127.0.0.1:${String(port)}`;
  try {
    await waitForHealth(purchasesUrl);
  } catch (error) {
    throw new Error(`${String(error)}\nchild output:\n${childOutput.join('')}`, { cause: error });
  }
}, 60_000);

afterAll(async () => {
  // Wait for the child to actually exit. Not politeness: an unawaited
  // ChildProcess handle keeps the Vitest run alive, and removing the temp
  // directory while the child still holds the SQLite file open is a race.
  await new Promise<void>((resolve) => {
    if (purchases.exitCode !== null || purchases.signalCode !== null) {
      resolve();
      return;
    }
    const kill = setTimeout(() => {
      purchases.kill('SIGKILL');
    }, 5000);
    purchases.once('exit', () => {
      clearTimeout(kill);
      resolve();
    });
    purchases.kill('SIGTERM');
  });

  await new Promise<void>((resolve) => {
    registry.close(() => {
      resolve();
    });
  });
  rmSync(dataDir, { recursive: true, force: true });
});

describe('the real entry point', () => {
  it('boots, migrates a fresh database and serves health', async () => {
    // Migrations run on a file that did not exist a moment ago — the one
    // thing an in-process test with a pre-migrated handle cannot check.
    const response = await fetch(`${purchasesUrl}/health`);
    expect(response.ok).toBe(true);
  });

  it('serves its OpenAPI, which is how other pillars route to it', async () => {
    const doc = (await (await fetch(`${purchasesUrl}/openapi`)).json()) as {
      paths: Record<string, unknown>;
    };
    expect(Object.keys(doc.paths)).toContain('/purchases');
  });
});

describe('reconciliation across a real socket', () => {
  it('ingests an order and links it to the peer transaction', async () => {
    await fetch(`${purchasesUrl}/sources/smoke`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        label: 'Smoke',
        descriptorPattern: 'AMAZON%',
        settlementWindowDays: 21,
        autoLinkPolicy: 'review',
      }),
    }).then((r) => expect(r.ok).toBe(true));

    const created = await fetch(`${purchasesUrl}/purchases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'smoke',
        sourceOrderId: 'smoke-1',
        ingestMethod: 'manual',
        orderedAt: '2026-03-04T00:00:00Z',
        currency: 'AUD',
        totalCents: ORDER_TOTAL_CENTS,
        checksum: 'smoke-1',
      }),
    });
    expect(created.status).toBe(201);
    const { purchase } = (await created.json()) as { purchase: { id: string } };

    // The ingest trigger and the poll both fire within a second or two.
    const deadline = Date.now() + 30_000;
    let accounting: { matchedCents: number; residualCents: number } | undefined;
    while (Date.now() < deadline) {
      const detail = (await (await fetch(`${purchasesUrl}/purchases/${purchase.id}`)).json()) as {
        accounting: { matchedCents: number; residualCents: number };
      };
      accounting = detail.accounting;
      if (accounting.matchedCents === ORDER_TOTAL_CENTS) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Money moved from unexplained to matched, decided by a solver in one
    // process against a transaction fetched from another over HTTP.
    expect(accounting?.matchedCents).toBe(ORDER_TOTAL_CENTS);
    expect(accounting?.residualCents).toBe(0);

    // And the fetch that decided it was credentialled. The in-process wire
    // test asserts the same thing about the client; this asserts it about
    // the deployed entry point, which is what reads the environment.
    expect(financeCallKeys.length).toBeGreaterThan(0);
    expect(new Set(financeCallKeys)).toEqual(new Set([SERVICE_ACCOUNT_KEY]));
  }, 60_000);
});
