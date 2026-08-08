/**
 * The assertion this whole seam exists for: an outbound cross-pillar call
 * carries bfm's service-account key.
 *
 * `@pops/pillar-sdk` exports two `pillar()` functions with the same name and
 * the same shape. The `/client` one is unauthenticated, and the cross-pillar
 * clients already in `finance`, `inventory` and `purchases` all import it — so
 * the natural way to write this code is the wrong one, it compiles, it runs,
 * and the only visible symptom is a header that silently stopped being sent.
 * Nothing but a wire-level assertion catches that, which is why this test
 * drives a real HTTP server through the real SDK rather than a stub, and why
 * it keeps an explicit `/client` control alongside.
 *
 * The key is a throwaway literal. Never put a real one in a fixture.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __resetSharedOpenApiCache,
  __resetSharedPillarClient,
  pillar as clientPillar,
} from '@pops/pillar-sdk/client';
import {
  __resetServerPillarCache,
  __resetServerSdkConfig,
  type PillarHandle,
} from '@pops/pillar-sdk/server';

import { createPillarGateway } from '../gateway.js';
import { configureBfmServerSdk } from '../sdk-config.js';
import { MissingServiceAccountKeyError } from '../service-account.js';

const SERVICE_ACCOUNT_KEY = 'sa_test_prefix.test_secret_not_a_real_key';

type TransactionsRouter = {
  transactions: {
    list: (input: { limit: number }) => Promise<{ data: readonly { id: string }[] }>;
  };
};

/**
 * The narrowest document that still lets the SDK resolve `transactions.list`.
 * A vendored copy of finance's real 17k-line spec would fail this pillar's
 * suite on any unrelated finance change; agreement with the real contract is
 * `scripts/ci/check-cross-pillar-expectations.mjs`'s job, and gains its row
 * when bfm's first real finance call lands.
 */
const FINANCE_OPENAPI = {
  openapi: '3.0.3',
  info: { title: 'finance', version: '0.1.0' },
  paths: {
    '/transactions': {
      get: {
        operationId: 'transactions.list',
        parameters: [{ name: 'limit', in: 'query', required: false, schema: { type: 'string' } }],
        responses: { '200': { description: 'ok' } },
      },
    },
  },
};

let server: Server;
let baseUrl: string;
/** Headers of every non-discovery, non-openapi request the SDK issued. */
let received: Record<string, string | string[] | undefined>[];
let secretsDir: string;

function routes(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  res.setHeader('content-type', 'application/json');
  if (url.pathname === '/registry/pillars') {
    res.end(
      JSON.stringify({
        pillars: [
          {
            pillarId: 'finance',
            baseUrl,
            status: 'healthy',
            manifest: { contract: { version: '0.1.0' } },
            lastSeenAt: '2026-08-08T00:00:00.000Z',
            registered: true,
          },
        ],
      })
    );
    return;
  }
  if (url.pathname === '/openapi') {
    res.end(JSON.stringify(FINANCE_OPENAPI));
    return;
  }
  received.push(req.headers);
  res.end(JSON.stringify({ data: [{ id: 'txn-1' }] }));
}

function resetSdk(): void {
  __resetServerSdkConfig();
  __resetServerPillarCache();
  __resetSharedPillarClient();
  // Keyed by pillar id with a 5-minute TTL, so without this a later test
  // resolves `finance` against a previous test's now-closed port.
  __resetSharedOpenApiCache();
}

beforeEach(async () => {
  received = [];
  resetSdk();
  secretsDir = mkdtempSync(join(tmpdir(), 'bfm-secrets-'));

  server = createServer(routes);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port bound');
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
});

afterEach(async () => {
  resetSdk();
  rmSync(secretsDir, { recursive: true, force: true });
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
});

function listTransactions(): Promise<unknown> {
  return createPillarGateway().call<TransactionsRouter, unknown>('finance', (handle) =>
    handle.transactions.list({ limit: 1 })
  );
}

describe('an outbound call configured through configureBfmServerSdk', () => {
  it('carries the service-account key as X-API-Key', async () => {
    configureBfmServerSdk({
      POPS_INTERNAL_API_KEY: SERVICE_ACCOUNT_KEY,
      POPS_REGISTRY_URL: baseUrl,
    });

    const outcome = await listTransactions();

    expect(outcome).toMatchObject({ kind: 'ok' });
    expect(received).toHaveLength(1);
    expect(received[0]?.['x-api-key']).toBe(SERVICE_ACCOUNT_KEY);
  });

  it('reads the key from a mounted secret file in preference to the environment', async () => {
    const keyFile = join(secretsDir, 'pops_bfm_api_key');
    writeFileSync(keyFile, `${SERVICE_ACCOUNT_KEY}\n`, 'utf8');

    configureBfmServerSdk({
      POPS_INTERNAL_API_KEY_FILE: keyFile,
      POPS_INTERNAL_API_KEY: 'sa_env.would_be_wrong',
      POPS_REGISTRY_URL: baseUrl,
    });

    await listTransactions();

    // Trailing newline stripped: a `printf`-authored secret and an
    // `echo`-authored one must authenticate identically.
    expect(received[0]?.['x-api-key']).toBe(SERVICE_ACCOUNT_KEY);
  });

  it('refuses to boot when neither source yields a key', () => {
    expect(() => configureBfmServerSdk({ POPS_REGISTRY_URL: baseUrl })).toThrow(
      MissingServiceAccountKeyError
    );
  });

  it('discovers peers from the configured registry rather than the compiled default', async () => {
    configureBfmServerSdk({
      POPS_INTERNAL_API_KEY: SERVICE_ACCOUNT_KEY,
      POPS_REGISTRY_URL: baseUrl,
    });

    const outcome = await listTransactions();

    // Against the built-in `registry-api:3001` default this would resolve to
    // nothing and report `unavailable` — indistinguishable from a real outage.
    expect(outcome).toMatchObject({ kind: 'ok' });
  });
});

/**
 * The control. If this ever starts passing with a key attached, the two
 * surfaces have converged and the import-site distinction above stopped
 * mattering; until then it is the reason the assertion above is worth having.
 */
describe('the same call built from the /client surface', () => {
  it('sends no service-account header at all', async () => {
    const handle = clientPillar<TransactionsRouter>('finance', {
      registry: { registryUrl: baseUrl },
      cacheTtlMs: 0,
    }) as PillarHandle<TransactionsRouter>;

    await handle.transactions.list({ limit: 1 });

    expect(received).toHaveLength(1);
    expect(received[0]?.['x-api-key']).toBeUndefined();
  });
});
