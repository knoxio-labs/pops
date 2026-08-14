/**
 * The assertion this seam exists for: every outbound cross-pillar call
 * finance makes carries its service-account key (POPS-2021).
 *
 * `@pops/pillar-sdk` exports two `pillar()` functions with the same name and
 * the same shape. The `/client` one is unauthenticated, and both of this
 * pillar's cross-pillar clients used to import it — so the natural way to
 * write this code is the wrong one, it compiles, it runs, and the only
 * visible symptom is a header that is silently not sent. Nothing but a
 * wire-level assertion catches that, which is why this drives a real HTTP
 * server through the real SDK rather than a stub, and why it keeps an
 * explicit `/client` control alongside.
 *
 * The key is a throwaway literal. Never put a real one in a fixture.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import {
  __resetSharedOpenApiCache,
  __resetSharedPillarClient,
  pillar as clientPillar,
} from '@pops/pillar-sdk/client';
import { __resetServerPillarCache, __resetServerSdkConfig } from '@pops/pillar-sdk/server';

import { createContactsClient, type ContactsRouter } from '../../contacts/client.js';
import { createPillarOwnerUriLookup } from '../../cron/pillar-lookup.js';
import { __resetOutboundCredentialReports } from '../outbound.js';
import { configureFinanceServerSdk } from '../sdk-config.js';
import { SERVICE_ACCOUNT_KEY_ENV, SERVICE_ACCOUNT_KEY_FILE_ENV } from '../service-account.js';

const SERVICE_ACCOUNT_KEY = 'pops_sa_TESTTEST.testsecret_not_a_real_key_000000';

/** Every pillar finance calls, all answered by the one test server. */
const CALLEES = ['contacts', 'registry'] as const;

const URI = 'pops://core/user/alice@example.com';

/**
 * The narrowest document that still lets the SDK resolve both operations. A
 * vendored copy of each producer's real spec would fail this suite on any
 * unrelated change to them; agreement with the real contracts is
 * `scripts/ci/check-cross-pillar-expectations.mjs`'s job, and this fixture's
 * job is the transport.
 */
const OPENAPI = {
  openapi: '3.0.3',
  info: { title: 'callee', version: '0.1.0' },
  paths: {
    '/entities': {
      get: {
        operationId: 'entities.list',
        parameters: ['search', 'type', 'limit', 'offset'].map((name) => ({
          name,
          in: 'query',
          required: false,
          schema: { type: 'string' },
        })),
        responses: { '200': { description: 'ok' } },
      },
    },
    '/users': {
      get: {
        operationId: 'users.get',
        parameters: [{ name: 'uri', in: 'query', required: true, schema: { type: 'string' } }],
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
/** Holds the mounted-secret fixture; recreated and removed per test. */
let secretsDir: string;

/** Forget both key sources, so nothing ambient decides a case here. */
function clearKeyEnv(): void {
  delete process.env[SERVICE_ACCOUNT_KEY_ENV];
  delete process.env[SERVICE_ACCOUNT_KEY_FILE_ENV];
}

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
  if (pathname === '/entities')
    return { data: [], pagination: { total: 0, limit: 200, offset: 0, hasMore: false } };
  return { data: { uri: URI } };
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
  // Both sources, not just the inline one: `resolveServiceAccountKey` reads
  // the file first, so an ambient `_FILE` pointing at a real secret would
  // quietly credential the no-key cases below and pass for the wrong reason.
  clearKeyEnv();
  secretsDir = mkdtempSync(join(tmpdir(), 'finance-secrets-'));
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
  clearKeyEnv();
  rmSync(secretsDir, { recursive: true, force: true });
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
});

function configure(): void {
  expect(configureFinanceServerSdk({ POPS_INTERNAL_API_KEY: SERVICE_ACCOUNT_KEY })).toBe(true);
}

/** The two legs, each named by the pillar it calls and the path it hits. */
const LEGS: readonly {
  readonly label: string;
  readonly path: string;
  readonly call: () => Promise<unknown>;
}[] = [
  {
    label: 'the entity matcher asking contacts for the whole contact set',
    path: '/entities',
    call: () => createContactsClient().fetchAllEntities(),
  },
  {
    label: 'the owner-URI cron asking registry whether a URI resolves',
    path: '/users',
    call: () => createPillarOwnerUriLookup()(URI),
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
    // The production source, end to end: `resolveServiceAccountKey`'s own
    // tests cover the reader, and this proves the value it returns is what
    // reaches the wire — the part a refactor of the boot wiring could break
    // while every file-reader test stayed green. The env var is set to a
    // decoy, so a wiring that read the wrong source would send that instead.
    const keyFile = join(secretsDir, 'pops_finance_api_key');
    writeFileSync(keyFile, `${SERVICE_ACCOUNT_KEY}\n`, 'utf8');
    process.env[SERVICE_ACCOUNT_KEY_FILE_ENV] = keyFile;
    process.env[SERVICE_ACCOUNT_KEY_ENV] = 'pops_sa_ENVENVEN.env_key_that_must_not_win_000000';

    expect(configureFinanceServerSdk()).toBe(true);
    await createPillarOwnerUriLookup()(URI);

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

    const handle = clientPillar<ContactsRouter>('contacts', {
      registry: { registryUrl: baseUrl },
      cacheTtlMs: 0,
    });
    await handle.entities.list({ limit: 1 });

    expect(received).toHaveLength(1);
    expect(received[0]?.apiKey).toBeUndefined();
  });
});

/**
 * The half the ticket is really about. A callee that adopts
 * `requireCredential` answers 403, and every one of these legs is written to
 * carry on regardless — so unless the refusal is named, finance's
 * reconciliation and entity matching quietly stop and the first symptom is
 * data that never updates.
 */
describe('a callee that rejects the credential', () => {
  beforeEach(() => {
    status = 403;
    configure();
  });

  it('surfaces on the contacts leg as an empty set, logged as a refusal', async () => {
    const result = await createContactsClient().fetchAllEntities();

    expect(result).toEqual([]);
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("rejected this pillar's service-account credential")
    );
  });

  it('surfaces on the registry cron leg as its own outcome', async () => {
    // `unavailable` here would be swallowed by the leg that treats an
    // outage as "retry tonight", and tonight would never be different.
    await expect(createPillarOwnerUriLookup()(URI)).resolves.toEqual({
      kind: 'unauthorized',
      reason: 'unauthorized',
    });
  });
});

/**
 * The deployment that has not been given a key yet. Every leg must say so
 * rather than falling back to an anonymous call — which today's callees
 * still admit, so the fallback would work right up until they stop.
 */
describe('a process with no service-account key', () => {
  beforeEach(() => {
    expect(configureFinanceServerSdk({})).toBe(false);
  });

  it('says so at boot, naming both sources', () => {
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('POPS_INTERNAL_API_KEY_FILE'));
  });

  it.each(LEGS)('issues no request at all on $label', async ({ call }) => {
    await call();

    expect(received).toEqual([]);
  });

  it('reports an empty contact set from the contacts leg', async () => {
    await expect(createContactsClient().fetchAllEntities()).resolves.toEqual([]);
  });

  it('reports no-credential from the registry cron leg', async () => {
    await expect(createPillarOwnerUriLookup()(URI)).resolves.toEqual({
      kind: 'unauthorized',
      reason: 'no-credential',
    });
  });
});
