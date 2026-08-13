/**
 * The assertion this seam exists for: every outbound cross-pillar call
 * purchases makes carries its service-account key.
 *
 * `@pops/pillar-sdk` exports two `pillar()` functions with the same name and
 * the same shape. The `/client` one is unauthenticated, and all three of this
 * pillar's cross-pillar clients used to import it — so the natural way to
 * write this code is the wrong one, it compiles, it runs, and the only
 * visible symptom is a header that is silently not sent. Nothing but a
 * wire-level assertion catches that, which is why this drives a real HTTP
 * server through the real SDK rather than a stub, and why it keeps an
 * explicit `/client` control alongside.
 *
 * The key is a throwaway literal. Never put a real one in a fixture.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import {
  __resetSharedOpenApiCache,
  __resetSharedPillarClient,
  pillar as clientPillar,
} from '@pops/pillar-sdk/client';
import { __resetServerPillarCache, __resetServerSdkConfig } from '@pops/pillar-sdk/server';

import { createMerchantResolver } from '../../contacts/merchant.js';
import { createDocumentLookup, createInventoryItemLookup } from '../../cron/pillar-lookup.js';
import { createFinanceClient, type FinanceRouter } from '../../finance/client.js';
import { __resetOutboundCredentialReports } from '../outbound.js';
import { configurePurchasesServerSdk } from '../sdk-config.js';

const SERVICE_ACCOUNT_KEY = 'pops_sa_TESTTEST.testsecret_not_a_real_key_000000';

/** Every pillar purchases calls, all answered by the one test server. */
const CALLEES = ['contacts', 'documents', 'finance', 'inventory'] as const;

/**
 * The narrowest document that still lets the SDK resolve all four
 * operations. A vendored copy of each producer's real spec would fail this
 * suite on any unrelated change to them; agreement with the real contracts is
 * `scripts/ci/check-cross-pillar-expectations.mjs`'s job, and this fixture's
 * job is the transport.
 */
const OPENAPI = {
  openapi: '3.0.3',
  info: { title: 'callee', version: '0.1.0' },
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
    '/entities': {
      get: {
        operationId: 'entities.list',
        parameters: ['search', 'limit'].map((name) => ({
          name,
          in: 'query',
          required: false,
          schema: { type: 'string' },
        })),
        responses: { '200': { description: 'ok' } },
      },
    },
    '/items/{id}': {
      get: {
        operationId: 'items.get',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'ok' } },
      },
    },
    '/paperless/documents/{id}': {
      get: {
        operationId: 'paperless.get',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'ok' } },
      },
    },
  },
};

/** One request the SDK issued into a producer's contract. */
interface Received {
  path: string;
  apiKey: string | string[] | undefined;
}

let server: Server;
let baseUrl: string;
let received: Received[];
/** HTTP status the next contract request is answered with. */
let status: number;
/** Silenced, and asserted on where a credential failure must be loud. */
let errorLog: MockInstance<(...args: unknown[]) => void>;

function registrySnapshot(): string {
  return JSON.stringify({
    pillars: CALLEES.map((pillarId) => ({
      pillarId,
      baseUrl,
      status: 'healthy',
      manifest: { contract: { version: '0.1.0' } },
      lastSeenAt: '2026-08-13T00:00:00.000Z',
      registered: true,
    })),
  });
}

function routes(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  res.setHeader('content-type', 'application/json');
  if (url.pathname === '/registry/pillars') {
    res.end(registrySnapshot());
    return;
  }
  if (url.pathname === '/openapi') {
    res.end(JSON.stringify(OPENAPI));
    return;
  }
  received.push({ path: url.pathname, apiKey: req.headers['x-api-key'] });
  res.statusCode = status;
  res.end(JSON.stringify(status === 200 ? okBody(url.pathname) : { message: 'missing scope' }));
}

/**
 * A body each caller can actually parse, so a leg reports what it would
 * report in production rather than a contract mismatch that happens to hit
 * the same code path.
 */
function okBody(pathname: string): unknown {
  if (pathname === '/transactions') {
    return { data: [], pagination: { total: 0, limit: 500, offset: 0, hasMore: false } };
  }
  if (pathname === '/entities') return { data: [{ id: 'contacts-1', name: 'Bunnings' }] };
  return { id: 'abc' };
}

function resetSdk(): void {
  __resetServerSdkConfig();
  __resetServerPillarCache();
  __resetSharedPillarClient();
  // Keyed by pillar id with a 5-minute TTL, so without this a later test
  // resolves a callee against a previous test's now-closed port.
  __resetSharedOpenApiCache();
  __resetOutboundCredentialReports();
}

beforeEach(async () => {
  received = [];
  status = 200;
  resetSdk();
  // The SDK falls back to this variable at call time, so an ambient one
  // would quietly credential the no-key cases below.
  delete process.env['POPS_INTERNAL_API_KEY'];
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  server = createServer(routes);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port bound');
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
  process.env['POPS_REGISTRY_URL'] = baseUrl;
});

afterEach(async () => {
  resetSdk();
  errorLog.mockRestore();
  delete process.env['POPS_REGISTRY_URL'];
  delete process.env['POPS_INTERNAL_API_KEY'];
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
});

function configure(): void {
  expect(configurePurchasesServerSdk({ POPS_INTERNAL_API_KEY: SERVICE_ACCOUNT_KEY })).toBe(true);
}

/** The four legs, each named by the pillar it calls and the path it hits. */
const LEGS: readonly {
  readonly label: string;
  readonly path: string;
  readonly call: () => Promise<unknown>;
}[] = [
  {
    label: 'the reconciliation sweep asking finance for candidates',
    path: '/transactions',
    call: () =>
      createFinanceClient().fetchCandidates({ startDate: '2026-03-01', endDate: '2026-03-22' }),
  },
  {
    label: 'the soft-URI cron asking inventory about an item',
    path: '/items/abc',
    call: () => createInventoryItemLookup()('abc'),
  },
  {
    label: 'the soft-URI cron asking documents about a document',
    path: '/paperless/documents/42',
    call: () => createDocumentLookup()('42'),
  },
  {
    label: 'receipt ingest resolving a merchant against contacts',
    path: '/entities',
    call: () => createMerchantResolver().resolve('Bunnings Warehouse'),
  },
];

describe('every outbound leg', () => {
  it.each(LEGS)('sends the service-account key on $label', async ({ path, call }) => {
    configure();

    await call();

    expect(received).toHaveLength(1);
    expect(received[0]?.path).toBe(path);
    expect(received[0]?.apiKey).toBe(SERVICE_ACCOUNT_KEY);
  });

  it('reads the key from a mounted secret file in preference to the environment', async () => {
    // The production source. `resolveServiceAccountKey`'s own tests cover the
    // file reader; this one proves the value it returns is what reaches the
    // wire, which is the part a refactor of the boot wiring could break.
    process.env['POPS_INTERNAL_API_KEY'] = SERVICE_ACCOUNT_KEY;
    expect(configurePurchasesServerSdk()).toBe(true);

    await createInventoryItemLookup()('abc');

    expect(received[0]?.apiKey).toBe(SERVICE_ACCOUNT_KEY);
  });
});

/**
 * The control. If this ever starts passing with a key attached, the two
 * surfaces have converged and the import-site distinction above stopped
 * mattering; until then it is the reason the assertions above are worth
 * having.
 */
describe('the same call built from the /client surface', () => {
  it('sends no service-account header at all', async () => {
    configure();

    const handle = clientPillar<FinanceRouter>('finance', {
      registry: { registryUrl: baseUrl },
      cacheTtlMs: 0,
    });
    await handle.transactions.list({ limit: 1 });

    expect(received).toHaveLength(1);
    expect(received[0]?.apiKey).toBeUndefined();
  });
});

/**
 * The half the ticket is really about. A callee that adopts
 * `requireCredential` answers 403, and every one of these legs is written to
 * carry on regardless — so unless the refusal is named, the fleet's
 * reconciliation quietly stops and the first symptom is data that never
 * updates.
 */
describe('a callee that rejects the credential', () => {
  beforeEach(() => {
    status = 403;
    configure();
  });

  it('surfaces on the finance leg as a refusal, not a bare outage', async () => {
    const result = await createFinanceClient().fetchCandidates({
      startDate: '2026-03-01',
      endDate: '2026-03-22',
    });

    expect(result).toEqual({ kind: 'unavailable', reason: 'unauthorized' });
  });

  it.each([
    ['inventory', () => createInventoryItemLookup()('abc')],
    ['documents', () => createDocumentLookup()('42')],
  ] as const)('surfaces on the %s cron leg as its own outcome', async (_label, call) => {
    // `unavailable` here would be swallowed by the leg that treats an
    // outage as "retry tonight", and tonight would never be different.
    await expect(call()).resolves.toEqual({ kind: 'unauthorized', reason: 'unauthorized' });
  });

  it('declines to name a merchant rather than guessing on the contacts leg', async () => {
    await expect(createMerchantResolver().resolve('Bunnings Warehouse')).resolves.toBeNull();

    expect(received).toHaveLength(1);
    // An unresolved merchant is a valid outcome here, so the null on its own
    // is no signal at all — the log line is the whole difference between a
    // merchant contacts does not know and a grant that needs widening.
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("contacts rejected this pillar's service-account credential")
    );
  });
});

/**
 * The deployment that has not been given a key yet. Every leg must say so
 * rather than falling back to an anonymous call — which today's callees still
 * admit, so the fallback would work right up until they stop.
 */
describe('a process with no service-account key', () => {
  beforeEach(() => {
    expect(configurePurchasesServerSdk({})).toBe(false);
  });

  it('says so at boot, naming both sources', () => {
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('POPS_INTERNAL_API_KEY_FILE'));
  });

  it.each(LEGS)('issues no request at all on $label', async ({ call }) => {
    await call();

    expect(received).toEqual([]);
  });

  it('reports no-credential from the finance leg', async () => {
    const result = await createFinanceClient().fetchCandidates({
      startDate: '2026-03-01',
      endDate: '2026-03-22',
    });

    expect(result).toEqual({ kind: 'unavailable', reason: 'no-credential' });
  });

  it('reports no-credential from a cron leg', async () => {
    await expect(createInventoryItemLookup()('abc')).resolves.toEqual({
      kind: 'unauthorized',
      reason: 'no-credential',
    });
  });
});
