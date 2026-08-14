/**
 * Live seam test — a real bfm process proxying a receipt upload to a real
 * purchases process through a real registry, over loopback HTTP (see
 * `@pops/pillar-sdk/testing`'s `spawnPillarProcess`).
 *
 * `mobile-receipts.test.ts` and `client.test.ts` beside this file only prove
 * the mapping: they stub the `PillarHandle` entirely, so they can never catch
 * a registry-discovery failure, an operationId that fails to resolve against
 * purchases' real OpenAPI, or a credential purchases actually refuses. This
 * file boots the three real processes, drives bfm's real
 * `POST /mobile/purchases/receipts` with no stub anywhere in the chain, and
 * independently observes what purchases received via a recording proxy in
 * front of it (`startRecordingProxy`) — the same technique
 * `peer-clients.live-seam.test.ts` uses for cerebrum → finance, and for the
 * same reason: bfm's outbound `pillar()` call happens inside the SPAWNED bfm
 * process, not this one, so there is no `fetch` in this file to intercept.
 *
 * **The credential is genuinely load-bearing here, not assumed.** Purchases
 * does not require a service-account key in production (browser traffic
 * carries none), so a test that only ever sends a credentialled call cannot
 * tell "the grant was checked" from "nothing was checked and happened to
 * agree". This suite closes that gap by starting purchases with
 * `PURCHASES_REQUIRE_SERVICE_ACCOUNT_CREDENTIAL=true` (see
 * `middleware/service-account-scope.ts`'s header) — a knob that exists
 * ONLY for this — and then proving both directions: a key holding the
 * `bfm` service account's actual grant (`purchases.receipt`, mirrored from
 * `pillars/service-account.ts`) is accepted, and a live key whose grant does
 * not cover it is refused with a 403. An uncredentialled call is refused
 * with a 401 for the same reason. None of that would be true if the scope
 * gate had regressed to waving every caller through.
 *
 * **Vision is fixture-driven, not real.** `read-receipt.ts`'s port for
 * "read a receipt" is Anthropic's Messages API, reached over
 * `ANTHROPIC_BASE_URL` — an env var the Anthropic SDK itself reads (see
 * `anthropic-vision.ts`), so purchases needs no code change to be pointed at
 * a fake. This file runs a tiny local HTTP server standing in for it and
 * queues one canned JSON extraction per upload; production always dials the
 * real model. A test that paid for a model call per run is a test nobody
 * runs.
 *
 * Excluded from the default `pnpm test` run (see `vitest.config.ts`'s
 * `live-seam` exclusion) — it spawns three real processes plus a fake
 * Anthropic server and is an order of magnitude slower than this pillar's
 * unit suite. Run it directly with `pnpm test:live-seam`.
 */
import { createSecretKey } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  getFreePort,
  resolvePillarDir,
  spawnPillarProcess,
  startRecordingProxy,
  waitForRegistration,
  type RecordingProxy,
  type SpawnedPillarProcess,
} from '@pops/pillar-sdk/testing';

import { deviceRow } from '../../../db/__tests__/helpers.js';
import { devices, openBfmDb } from '../../../db/index.js';
import { mintAccessToken } from '../../auth/access-token.js';
import { MOBILE_RECEIPT_UPLOAD_PATH } from '../../paths.js';
import { PURCHASES_PILLAR_ID } from '../client.js';

import type { MobileReceiptOutcome } from '../../../contract/rest-schemas.js';

/**
 * Purchases' own test-only escape hatch (`middleware/service-account-scope.ts`).
 * Named here rather than imported: pillars cross the wire, not the module
 * graph (see AGENTS.md, "cross-pillar calls are HTTP-only") — `@pops/bfm`
 * carries no build-time dependency on `@pops/purchases` and must not gain
 * one just to name an env var.
 */
const PURCHASES_REQUIRE_CREDENTIAL_ENV = 'PURCHASES_REQUIRE_SERVICE_ACCOUNT_CREDENTIAL';

/** Well above `MIN_ACCESS_TOKEN_SECRET_LENGTH`; the value itself is arbitrary. */
const BFM_ACCESS_TOKEN_SECRET = 'live-seam-bfm-purchases-access-token-signing-secret-32plus';

/** A reading whose lines sum exactly to the stated total — admissible as fact. */
const GOOD_READING = JSON.stringify({
  merchantName: 'Live Seam Cafe',
  address: null,
  timeZone: null,
  purchasedOn: '2026-08-13',
  purchasedAt: '10:15',
  currency: 'AUD',
  total: '$4.50',
  tax: null,
  discounts: [],
  surcharges: [],
  shipping: null,
  lines: [{ description: 'Flat White', amount: '$4.50' }],
  unreadable: [],
});

/** A reading whose lines do NOT sum to the stated total — a real purchase needing a human. */
const MISMATCH_READING = JSON.stringify({
  merchantName: 'Live Seam Deli',
  address: null,
  timeZone: null,
  purchasedOn: '2026-08-13',
  purchasedAt: '12:40',
  currency: 'AUD',
  total: '$12.00',
  tax: null,
  discounts: [],
  surcharges: [],
  shipping: null,
  lines: [{ description: 'Sandwich', amount: '$9.00' }],
  unreadable: [],
});

interface FakeVisionServer {
  readonly baseUrl: string;
  /** Consumed FIFO, one entry per `POST /v1/messages` the fake receives. */
  enqueue(text: string): void;
  /** Every request body the fake received, verbatim, in arrival order. */
  readonly receivedBodies: string[];
  stop(): Promise<void>;
}

/**
 * A stand-in for `https://api.anthropic.com`, reachable only because the
 * Anthropic SDK itself honours `ANTHROPIC_BASE_URL` — see this file's header.
 * Answers whatever `enqueue` queued, shaped like a real Messages API
 * response; `anthropic-vision.ts` reads only `content` and `usage` off it.
 *
 * Also records each request body it receives, so a test can assert the
 * uploaded receipt bytes actually reached this end of the seam — bfm's
 * upload traversing purchases' vision port intact, not just a 200 back.
 */
async function startFakeVisionServer(): Promise<FakeVisionServer> {
  const queue: string[] = [];
  const receivedBodies: string[] = [];

  const server: Server = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/messages') {
      res.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      receivedBodies.push(Buffer.concat(chunks).toString('utf8'));
      const text = queue.shift();
      if (text === undefined) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'no canned live-seam vision answer queued' } }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'msg_live_seam',
          type: 'message',
          role: 'assistant',
          model: 'claude-live-seam-fake',
          content: [{ type: 'text', text }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        })
      );
    });
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('could not resolve a port for the fake vision server'));
        return;
      }
      resolve(address.port);
    });
  });

  return {
    baseUrl: `http://127.0.0.1:${String(port)}`,
    enqueue: (text: string) => queue.push(text),
    receivedBodies,
    stop: () =>
      new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

interface CreatedServiceAccountBody {
  plaintextKey: string;
}

/**
 * Mint a service account through the registry's admin surface. Reachable
 * with no credential at all: `resolvePrincipal` (registry's identity
 * middleware) falls back to a dev user whenever `NODE_ENV !== 'production'`,
 * which is exactly this test's own process — the same fallback every other
 * unauthenticated local dev request already relies on.
 */
async function mintServiceAccount(
  registryBaseUrl: string,
  name: string,
  scopes: readonly string[]
): Promise<string> {
  const response = await fetch(`${registryBaseUrl}/service-accounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, scopes }),
  });
  if (response.status !== 201) {
    throw new Error(
      `failed to mint live-seam service account '${name}': HTTP ${String(response.status)}`
    );
  }
  const body = (await response.json()) as CreatedServiceAccountBody;
  return body.plaintextKey;
}

function post(bfmBaseUrl: string, token: string, partsText: string): Promise<Response> {
  return fetch(`${bfmBaseUrl}${MOBILE_RECEIPT_UPLOAD_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      parts: [
        { mediaType: 'text/plain', dataBase64: Buffer.from(partsText, 'utf8').toString('base64') },
      ],
    }),
  });
}

describe('bfm -> purchases receipt upload live seam', () => {
  let tempDir: string;
  let vision: FakeVisionServer;
  let registryProcess: SpawnedPillarProcess;
  let purchasesProxy: RecordingProxy;
  let purchasesProcess: SpawnedPillarProcess;
  let bfmProcess: SpawnedPillarProcess;
  let deviceToken: string;
  /** Holds a live grant that does NOT cover `purchases.receipt` — proves the scope, not just the key, is checked. */
  let wrongScopeApiKey: string;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'live-seam-bfm-purchases-'));
    vision = await startFakeVisionServer();

    const registryPort = await getFreePort();
    registryProcess = await spawnPillarProcess({
      label: 'registry',
      cwd: resolvePillarDir(import.meta.url, 'registry'),
      port: registryPort,
      env: {
        POPS_REGISTRY_ENABLED: 'true',
        REGISTRY_SQLITE_PATH: join(tempDir, 'registry.db'),
      },
    });

    // The exact grant `pillars/service-account.ts` documents for production —
    // `purchases.receipt` and nothing under `purchases.purchase` — so a
    // scope this suite is not entitled to would fail here the same way it
    // would fail a deployed bfm.
    const bfmApiKey = await mintServiceAccount(registryProcess.baseUrl, 'bfm-live-seam', [
      'finance.transactions',
      'purchases.receipt',
    ]);
    wrongScopeApiKey = await mintServiceAccount(
      registryProcess.baseUrl,
      'bfm-live-seam-wrong-scope',
      ['finance.transactions']
    );

    const purchasesPort = await getFreePort();
    purchasesProxy = await startRecordingProxy(`http://127.0.0.1:${purchasesPort}`);
    purchasesProcess = await spawnPillarProcess({
      label: 'purchases',
      cwd: resolvePillarDir(import.meta.url, 'purchases'),
      port: purchasesPort,
      env: {
        POPS_REGISTRY_ENABLED: 'true',
        POPS_REGISTRY_URL: registryProcess.baseUrl,
        PURCHASES_SQLITE_PATH: join(tempDir, 'purchases.db'),
        // Advertise the RECORDING PROXY's address, not purchases' own — see
        // this file's header and the cerebrum -> finance live seam test,
        // which established the pattern.
        PURCHASES_SELF_BASE_URL: purchasesProxy.baseUrl,
        ANTHROPIC_API_KEY: 'live-seam-fake-anthropic-key',
        ANTHROPIC_BASE_URL: vision.baseUrl,
        [PURCHASES_REQUIRE_CREDENTIAL_ENV]: 'true',
      },
    });

    await waitForRegistration(registryProcess.baseUrl, PURCHASES_PILLAR_ID);

    const bfmPort = await getFreePort();
    bfmProcess = await spawnPillarProcess({
      label: 'bfm',
      cwd: resolvePillarDir(import.meta.url, 'bfm'),
      port: bfmPort,
      env: {
        POPS_REGISTRY_ENABLED: 'true',
        POPS_REGISTRY_URL: registryProcess.baseUrl,
        BFM_SQLITE_PATH: join(tempDir, 'bfm.db'),
        BFM_SELF_BASE_URL: `http://127.0.0.1:${String(bfmPort)}`,
        BFM_ACCESS_TOKEN_SECRET,
        POPS_INTERNAL_API_KEY: bfmApiKey,
      },
    });

    // No HTTP route pairs a device outside the real phone-pairing challenge,
    // so the paired device this suite needs is written straight into the
    // sqlite file bfm itself opened — the same file, a second short-lived
    // connection, safe under WAL (see `open-bfm-db.ts`'s header). Opened
    // only after bfm's own boot (which `spawnPillarProcess` already waited
    // out via `/health`) has applied migrations.
    const secondBfmHandle = openBfmDb(join(tempDir, 'bfm.db'));
    const row = deviceRow();
    secondBfmHandle.db.insert(devices).values(row).run();
    secondBfmHandle.raw.close();
    deviceToken = mintAccessToken(
      row.id,
      createSecretKey(Buffer.from(BFM_ACCESS_TOKEN_SECRET, 'utf8'))
    ).token;
  }, 60_000);

  afterAll(async () => {
    await bfmProcess?.stop();
    await purchasesProcess?.stop();
    await purchasesProxy?.stop();
    await registryProcess?.stop();
    await vision?.stop();
    // `tempDir` may be unset if `beforeAll` threw before `mkdtempSync` ran;
    // `afterAll` still runs cleanup in that case, and rmSync(undefined, ...)
    // would throw and mask the original failure.
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it('a receipt upload proxied through bfm reaches purchases and comes back created', async () => {
    vision.enqueue(GOOD_READING);

    const response = await post(
      bfmProcess.baseUrl,
      deviceToken,
      'Live Seam Cafe\nFlat White  $4.50\nTotal       $4.50'
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as MobileReceiptOutcome;
    if (body.kind !== 'created') {
      throw new Error(`expected a 'created' outcome, got ${JSON.stringify(body)}`);
    }
    expect(body.alreadyStored).toBe(false);
    expect(body.purchase.merchantName).toBe('Live Seam Cafe');
    expect(body.purchase.totalCents).toBe(450);
    expect(body.purchase.currency).toBe('AUD');
    expect(body.purchase.itemCount).toBe(1);

    // Independent verification: what purchases itself answered on the wire,
    // not the SDK's or bfm's view of it.
    const uploadCalls = purchasesProxy.requests.filter((entry) => entry.url.endsWith('/receipts'));
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0]?.method).toBe('POST');
    expect(uploadCalls[0]?.status).toBe(200);
    expect(uploadCalls[0]?.bodySnippet).toContain('"kind":"created"');

    // Independent verification of the other end: the bytes bfm uploaded
    // reached purchases' vision port intact, not just that purchases
    // answered 200. Proves the seam carries the payload, not merely a
    // successful round trip.
    expect(vision.receivedBodies.at(-1)).toContain(
      'Live Seam Cafe\\nFlat White  $4.50\\nTotal       $4.50'
    );
  });

  it('a needs-review refusal crosses the seam intact, reshaped to the mobile contract', async () => {
    vision.enqueue(MISMATCH_READING);

    const response = await post(
      bfmProcess.baseUrl,
      deviceToken,
      'Live Seam Deli\nSandwich    $9.00\nTotal       $12.00'
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as MobileReceiptOutcome;
    if (body.kind !== 'needs-review') {
      throw new Error(`expected a 'needs-review' outcome, got ${JSON.stringify(body)}`);
    }
    expect(body.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'sum-mismatch' })])
    );

    const uploadCalls = purchasesProxy.requests.filter((entry) => entry.url.endsWith('/receipts'));
    // The first entry is the prior test's `created` upload; this test's own
    // call is whichever landed after it.
    const thisCall = uploadCalls.at(-1);
    expect(thisCall?.status).toBe(200);
    expect(thisCall?.bodySnippet).toContain('"kind":"needs-review"');
  });

  describe('the credential purchases now requires', () => {
    it('refuses an uncredentialled call — proving requireCredential is genuinely on', async () => {
      const response = await fetch(`${purchasesProcess.baseUrl}/receipts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parts: [] }),
      });

      expect(response.status).toBe(401);
    });

    it('refuses a live key whose grant does not cover purchases.receipt', async () => {
      const response = await fetch(`${purchasesProcess.baseUrl}/receipts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': wrongScopeApiKey },
        body: JSON.stringify({ parts: [] }),
      });

      expect(response.status).toBe(403);
    });
  });
});
