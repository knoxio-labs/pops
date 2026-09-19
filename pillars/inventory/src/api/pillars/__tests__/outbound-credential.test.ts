/**
 * The assertion this seam exists for: inventory's one outbound cross-pillar
 * call — `codes/suggest`'s ranking leg into `ai` — carries its
 * service-account key (POPS-2021).
 *
 * `@pops/pillar-sdk` exports two `pillar()` functions with the same name and
 * the same shape. The `/client` one is unauthenticated, and the natural way
 * to write this code is to reach for it — it compiles, it runs, and the only
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

import { AI_PILLAR_ID, createAiClient, type AiRouter } from '../../ai/client.js';
import { __resetOutboundCredentialReports } from '../outbound.js';
import { configureInventoryServerSdk } from '../sdk-config.js';
import { SERVICE_ACCOUNT_KEY_ENV, SERVICE_ACCOUNT_KEY_FILE_ENV } from '../service-account.js';

const SERVICE_ACCOUNT_KEY = 'pops_sa_TESTTEST.testsecret_not_a_real_key_000000';

const CANDIDATES = ['LAMP-01', 'LAMP-02', 'LAMP-03'];
const CONTEXT = { name: 'Desk lamp' };

/**
 * The narrowest document that still lets the SDK resolve the one operation
 * this pillar calls. A vendored copy of `ai`'s real spec would fail this
 * suite on any unrelated change to it; agreement with the real contract is
 * `scripts/ci/check-cross-pillar-expectations.mjs`'s job, and this fixture's
 * job is the transport.
 */
const OPENAPI = {
  openapi: '3.0.3',
  info: { title: 'callee', version: '0.1.0' },
  paths: {
    '/codes/rank': {
      post: {
        operationId: 'codes.rank',
        responses: { '200': { description: 'ok' } },
      },
    },
  },
};

/** One request the SDK issued into the `ai` contract. */
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
    pillars: [
      {
        pillarId: AI_PILLAR_ID,
        baseUrl,
        status: 'healthy',
        manifest: { contract: { version: '0.1.0' } },
        lastSeenAt: '2026-08-13T00:00:00.000Z',
        registered: true,
      },
    ],
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
  res.end(
    JSON.stringify(
      status === 200
        ? { data: { ranked: [...CANDIDATES].reverse() } }
        : { message: 'missing scope' }
    )
  );
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
  secretsDir = mkdtempSync(join(tmpdir(), 'inventory-secrets-'));
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
  expect(configureInventoryServerSdk({ POPS_INTERNAL_API_KEY: SERVICE_ACCOUNT_KEY })).toBe(true);
}

describe('the ai ranking leg', () => {
  it('sends the service-account key when ranking candidates', async () => {
    configure();

    const ranked = await createAiClient().rankCodeCandidates(CANDIDATES, CONTEXT);

    expect(received).toHaveLength(1);
    expect(received[0]?.path).toBe('/codes/rank');
    expect(received[0]?.apiKey).toBe(SERVICE_ACCOUNT_KEY);
    expect(ranked).toEqual([...CANDIDATES].reverse());
  });

  it('reads the key from a mounted secret file in preference to the environment', async () => {
    // The production source, end to end: `resolveServiceAccountKey`'s own
    // tests cover the reader, and this proves the value it returns is what
    // reaches the wire — the part a refactor of the boot wiring could break
    // while every file-reader test stayed green. The env var is set to a
    // decoy, so a wiring that read the wrong source would send that instead.
    const keyFile = join(secretsDir, 'pops_inventory_api_key');
    writeFileSync(keyFile, `${SERVICE_ACCOUNT_KEY}\n`, 'utf8');
    process.env[SERVICE_ACCOUNT_KEY_FILE_ENV] = keyFile;
    process.env[SERVICE_ACCOUNT_KEY_ENV] = 'pops_sa_ENVENVEN.env_key_that_must_not_win_000000';

    expect(configureInventoryServerSdk()).toBe(true);
    await createAiClient().rankCodeCandidates(CANDIDATES, CONTEXT);

    expect(received[0]?.apiKey).toBe(SERVICE_ACCOUNT_KEY);
  });
});

/**
 * The control. If this ever starts passing with a key attached, the two
 * surfaces have converged and the import-site distinction above stopped
 * mattering; until then it is the reason the assertion above is worth
 * having.
 */
describe('the same call built from the /client surface', () => {
  it('sends no service-account header at all', async () => {
    configure();

    const handle = clientPillar<AiRouter>('ai', {
      registry: { registryUrl: baseUrl },
      cacheTtlMs: 0,
    });
    await handle.codes.rank({ name: CONTEXT.name, candidates: [...CANDIDATES] });

    expect(received).toHaveLength(1);
    expect(received[0]?.apiKey).toBeUndefined();
  });
});

/**
 * The half the ticket is really about. A callee that adopts
 * `requireCredential` answers 403, and the leg is written to carry on
 * regardless — falling back to the deterministic order — so unless the
 * refusal is named, a revoked grant looks identical to `ai` simply agreeing
 * with the deterministic order every time.
 */
describe('a callee that rejects the credential', () => {
  beforeEach(() => {
    status = 403;
    configure();
  });

  it('falls back to undefined and logs the refusal, not a bare failure', async () => {
    const ranked = await createAiClient().rankCodeCandidates(CANDIDATES, CONTEXT);

    expect(ranked).toBeUndefined();
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("ai rejected this pillar's service-account credential")
    );
  });
});

/**
 * The deployment that has not been given a key yet. The leg must fall back
 * silently to the deterministic order rather than attempting an anonymous
 * call — which `ai` may or may not still admit — and without per-request
 * noise: the absence is reported once at boot, not on every suggestion.
 */
describe('a process with no service-account key', () => {
  beforeEach(() => {
    expect(configureInventoryServerSdk({})).toBe(false);
  });

  it('says so at boot, naming both sources', () => {
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('POPS_INTERNAL_API_KEY_FILE'));
  });

  it('issues no request at all and returns undefined', async () => {
    const ranked = await createAiClient().rankCodeCandidates(CANDIDATES, CONTEXT);

    expect(received).toEqual([]);
    expect(ranked).toBeUndefined();
  });

  it('reports the missing key once per pillar id, not on every suggestion', async () => {
    await createAiClient().rankCodeCandidates(CANDIDATES, CONTEXT);
    const callsAfterFirst = errorLog.mock.calls.length;

    await createAiClient().rankCodeCandidates(CANDIDATES, CONTEXT);
    await createAiClient().rankCodeCandidates(CANDIDATES, CONTEXT);

    expect(errorLog.mock.calls.length).toBe(callsAfterFirst);
  });
});
