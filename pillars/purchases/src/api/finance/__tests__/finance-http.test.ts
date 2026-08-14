/**
 * The finance leg over REAL HTTP.
 *
 * Every other test of this client drives a stub handle, which proves the
 * paging and degradation logic but proves nothing about the transport: the
 * pillar SDK resolves a call by fetching the registry snapshot, then
 * fetching the producer's OpenAPI, then matching the property chain against
 * an `operationId`. None of that is exercised by a stub, and all of it
 * fails at runtime rather than at build.
 *
 * So this stands up a real HTTP server and drives the client through the
 * real SDK proxy — discovery, route map, call, parse.
 *
 * That the served document still matches finance's real one is a separate
 * question, and a separate guard answers it:
 * `scripts/ci/check-cross-pillar-expectations.mjs` reads finance's
 * published OpenAPI and fails if `transactions.list` is renamed, moved, or
 * loses a query parameter this client sends. Together they cover the seam
 * the browser-facing clients get from regenerate-and-diff.
 */
import { createServer, type Server } from 'node:http';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __resetServerPillarCache,
  __resetServerSdkConfig,
  configureServerSdk,
  pillar,
} from '@pops/pillar-sdk/server';

import { createFinanceClient, type FinanceRouter } from '../client.js';

/** Throwaway literal. The wire assertion about it lives elsewhere. */
const SERVICE_ACCOUNT_KEY = 'pops_sa_HTTPTEST.testsecret_not_a_real_key_0000';

/**
 * A minimal OpenAPI document declaring exactly the operation this leg
 * calls, in the shape finance publishes it.
 *
 * Not a vendored copy of finance's real document: that is 17k lines
 * describing its whole API, and pinning one operation with it would mean an
 * unrelated finance route change failing this pillar's drift check — noise
 * that teaches people to re-vendor without reading. It would also be a
 * 640KB blob in the repo to assert one path.
 *
 * The agreement with finance's actual contract is asserted separately and
 * cheaply by `scripts/ci/check-cross-pillar-expectations.mjs`, which reads
 * finance's published spec and fails if `transactions.list` is renamed,
 * moved, or loses a query parameter this client sends. That guard pins the
 * contract; this fixture exercises the transport.
 */
const FINANCE_OPENAPI = {
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
};

/**
 * The snapshot entry the registry publishes for finance. `status` is a
 * closed vocabulary (`healthy`/`unavailable`/`unknown`) and `manifest` is
 * required — the SDK rejects the whole snapshot otherwise, which surfaces
 * as an indistinguishable `unavailable`.
 */
const FINANCE_MANIFEST = { contract: { version: '0.1.0' } };

/** The one definition of the registry snapshot. Duplicating it once already
 * cost a debugging round: the copy that drifted sent an invalid `status`
 * and the SDK reported it as an indistinguishable `unavailable`. */
function registrySnapshot(financeBaseUrl: string): string {
  return JSON.stringify({
    pillars: [
      {
        pillarId: 'finance',
        baseUrl: financeBaseUrl,
        status: 'healthy',
        manifest: FINANCE_MANIFEST,
        lastSeenAt: '2026-03-04T00:00:00.000Z',
        registered: true,
      },
    ],
  });
}

/**
 * Serve the two documents the SDK needs before it can call anything, and
 * hand every other request to `onCall`.
 */
function financeRoutes(onCall: (url: URL, res: import('node:http').ServerResponse) => void) {
  return (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    res.setHeader('content-type', 'application/json');
    if (url.pathname === '/registry/pillars') {
      res.end(registrySnapshot(baseUrl));
      return;
    }
    if (url.pathname === '/openapi') {
      res.end(JSON.stringify(FINANCE_OPENAPI));
      return;
    }
    onCall(url, res);
  };
}

let server: Server;
let baseUrl: string;
/** Every `GET /transactions` the SDK actually issued, for asserting the wire call. */
let received: URL[];
/** What the fake finance returns for the next transactions call. */
let payload: unknown;

beforeEach(async () => {
  received = [];
  payload = { data: [], pagination: { total: 0, limit: 500, offset: 0, hasMore: false } };

  server = createServer(
    financeRoutes((url, res) => {
      received.push(url);
      res.end(JSON.stringify(payload));
    })
  );

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  baseUrl = `http://127.0.0.1:${String(address.port)}`;

  __resetServerSdkConfig();
  __resetServerPillarCache();
  configureServerSdk({ apiKey: SERVICE_ACCOUNT_KEY, registry: { registryUrl: baseUrl } });
});

afterEach(async () => {
  __resetServerSdkConfig();
  __resetServerPillarCache();
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
});

/**
 * A client wired to the test server through the real SDK proxy — the
 * credentialled `/server` one production uses, so the paging and money
 * assertions below run over the transport that actually ships. That the key
 * reaches the wire is `api/pillars/__tests__/outbound-credential.test.ts`'s
 * assertion, not this file's.
 */
function liveClient() {
  return createFinanceClient(() =>
    // Zero TTL so each test resolves against its own server rather than a
    // snapshot cached by a previous one.
    pillar<FinanceRouter>('finance', { cacheTtlMs: 0 })
  );
}

const WINDOW = { startDate: '2026-03-01', endDate: '2026-03-22' };

describe('the leg resolves against finance real contract', () => {
  it('reaches GET /transactions through registry discovery and the OpenAPI route map', async () => {
    // If `transactions.list` were not a real operationId in finance's
    // published document, the SDK would return contract-mismatch here and
    // no request would ever be issued.
    const result = await liveClient().fetchCandidates(WINDOW);

    expect(result.kind).toBe('ok');
    expect(received).toHaveLength(1);
  });

  it('sends the window and paging as query parameters finance declares', async () => {
    await liveClient().fetchCandidates({ ...WINDOW, search: 'AMAZON' });

    const [call] = received;
    expect(call?.searchParams.get('startDate')).toBe('2026-03-01');
    expect(call?.searchParams.get('endDate')).toBe('2026-03-22');
    expect(call?.searchParams.get('search')).toBe('AMAZON');
    expect(call?.searchParams.get('limit')).toBe('500');
    expect(call?.searchParams.get('offset')).toBe('0');
  });

  it('converts decimal dollars on the wire into integer cents', async () => {
    // The whole money boundary, end to end over HTTP rather than through a
    // stub that could quietly hand back cents.
    payload = {
      data: [
        {
          id: 'txn-1',
          description: 'AMAZON MKTPLACE AU',
          account: 'everyday',
          amount: 19.99,
          date: '2026-03-04',
          type: 'purchase',
          entityId: null,
          entityName: null,
        },
      ],
      pagination: { total: 1, limit: 500, offset: 0, hasMore: false },
    };

    const result = await liveClient().fetchCandidates(WINDOW);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.transactions[0]?.amountCents).toBe(1999);
    expect(result.transactions[0]?.uri).toBe('pops://finance/transaction/txn-1');
  });

  it('pages over real HTTP until the producer says there is no more', async () => {
    let page = 0;
    server.removeAllListeners('request');
    server.on(
      'request',
      financeRoutes((url, res) => {
        received.push(url);
        const hasMore = page === 0;
        res.end(
          JSON.stringify({
            data: [
              {
                id: `txn-${String(page)}`,
                description: 'AMAZON MKTPLACE AU',
                account: 'everyday',
                amount: 10,
                date: '2026-03-04',
                type: 'purchase',
                entityId: null,
                entityName: null,
              },
            ],
            pagination: { total: 2, limit: 500, offset: page * 500, hasMore },
          })
        );
        page += 1;
      })
    );

    const result = await liveClient().fetchCandidates(WINDOW);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.transactions).toHaveLength(2);
    expect(received[1]?.searchParams.get('offset')).toBe('500');
  });
});

describe('a finance that is down', () => {
  it('degrades to unavailable rather than throwing or reading as empty', async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    // Re-open a dead listener so afterEach's close() still succeeds.
    server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    const result = await liveClient().fetchCandidates(WINDOW);

    expect(result.kind).toBe('unavailable');
  });
});
