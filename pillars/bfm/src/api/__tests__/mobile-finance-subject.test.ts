/**
 * What bfm tells finance about the device behind a call (POPS-5884).
 *
 * Driven through the real app, the real perimeter and the real SDK against a
 * finance stand-in on a socket, because the property is a header on the wire
 * and a fake handle never reaches the code that writes it.
 *
 * The keys and addresses are throwaway literals.
 */
import { createServer, type Server } from 'node:http';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetSharedOpenApiCache, __resetSharedPillarClient } from '@pops/pillar-sdk/client';
import { __resetServerPillarCache, __resetServerSdkConfig } from '@pops/pillar-sdk/server';

import {
  GUEST_DEVICE_CAPABILITIES,
  serialiseDeviceCapabilities,
} from '../../contract/capabilities.js';
import {
  MobileAccountsPageSchema,
  MobileUpstreamErrorSchema,
} from '../../contract/rest-schemas.js';
import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { currentDeviceSubject, runWithDeviceSubject } from '../auth/device-subject.js';
import { createMobileFinanceClient } from '../finance/client.js';
import { createPillarGateway } from '../pillars/gateway.js';
import { configureBfmServerSdk } from '../pillars/sdk-config.js';
import { BFM_SERVICE_ACCOUNT_SCOPES } from '../pillars/service-account.js';
import { financeAccountRow, financeRow } from './finance-fake.js';
import { startFinanceHttpFake, type FinanceHttpFake } from './finance-http-fake.js';
import { createTestApp, type TestApp } from './harness.js';
import { requestOn } from './test-http.js';

const SERVICE_ACCOUNT_KEY = 'pops_sa_TESTTEST.testsecret_not_a_real_key_000000';
const GUEST = 'rosane@example.com';
const OTHER_GUEST = 'someone.else@example.com';

const SHARED = financeAccountRow({ id: 'acc-shared', name: 'Rosane', kind: 'person' });
const PRIVATE = financeAccountRow({ id: 'acc-private', name: 'Up Everyday' });

let finance: FinanceHttpFake;
let app: TestApp;

function resetSdk(): void {
  __resetServerSdkConfig();
  __resetServerPillarCache();
  __resetSharedPillarClient();
  __resetSharedOpenApiCache();
}

beforeEach(async () => {
  resetSdk();
  finance = await startFinanceHttpFake({
    accounts: [SHARED, PRIVATE],
    transactions: [
      financeRow({ id: 'txn-shared', accountId: SHARED.id, date: '2026-10-02' }),
      financeRow({ id: 'txn-private', accountId: PRIVATE.id, date: '2026-10-01' }),
    ],
  });
  finance.grant(GUEST, SHARED.id, 'edit');
  configureBfmServerSdk({
    POPS_INTERNAL_API_KEY: SERVICE_ACCOUNT_KEY,
    POPS_REGISTRY_URL: finance.baseUrl,
  });
  // The production wiring: a gateway built with no factory of its own.
  app = createTestApp({ finance: createMobileFinanceClient(createPillarGateway()) });
});

afterEach(async () => {
  app.cleanup();
  resetSdk();
  await finance.close();
});

interface Device {
  authorization: string;
}

function operatorDevice(): Device {
  const row = deviceRow();
  app.db.insert(devices).values(row).run();
  return { authorization: `Bearer ${mintAccessToken(row.id, app.accessTokenSigningKey).token}` };
}

function guestDevice(email: string = GUEST): Device {
  const row = deviceRow({
    subjectEmail: email,
    capabilities: serialiseDeviceCapabilities(GUEST_DEVICE_CAPABILITIES),
  });
  app.db.insert(devices).values(row).run();
  return { authorization: `Bearer ${mintAccessToken(row.id, app.accessTokenSigningKey).token}` };
}

function get(device: Device, path: string) {
  return requestOn(app.app, (r) => r.get(path).set('Authorization', device.authorization));
}

function accountIds(body: unknown): string[] {
  return MobileAccountsPageSchema.parse(body).accounts.map((account) => account.id);
}

function subjectsSent(): (string | string[] | undefined)[] {
  return finance.calls.map((call) => call.subject);
}

describe('a guest device', () => {
  it('names its guest on the accounts list and is served only the granted account', async () => {
    const res = await get(guestDevice(), '/mobile/finance/accounts');

    expect(res.status).toBe(200);
    expect(accountIds(res.body)).toEqual([SHARED.id]);
    expect(res.body.totalCount).toBe(1);
    expect(finance.calls).toEqual([
      { path: '/accounts', subject: GUEST, apiKey: SERVICE_ACCOUNT_KEY },
    ]);
  });

  it('is told the role finance gave it on each account', async () => {
    const res = await get(guestDevice(), '/mobile/finance/accounts');

    expect(res.body.accounts[0].viewerRole).toBe('edit');
  });

  it('names its guest on every call behind the transactions list, not only the first', async () => {
    const res = await get(guestDevice(), '/mobile/finance/transactions');

    expect(res.status).toBe(200);
    expect(res.body.data.map((row: { id: string }) => row.id)).toEqual(['txn-shared']);
    // The page, then one account lookup for its currency.
    expect(finance.calls.map((call) => call.path)).toEqual([
      '/transactions',
      '/accounts/acc-shared',
    ]);
    expect(subjectsSent()).toEqual([GUEST, GUEST]);
  });

  it('names its guest on the account detail and on the history call behind it', async () => {
    const res = await get(guestDevice(), `/mobile/finance/accounts/${SHARED.id}`);

    expect(res.status).toBe(200);
    expect(res.body.account.viewerRole).toBe('edit');
    expect(subjectsSent()).toEqual([GUEST, GUEST]);
  });

  it('sends the address the device was paired for, and no other guest sees its accounts', async () => {
    const res = await get(guestDevice(OTHER_GUEST), '/mobile/finance/accounts');

    expect(accountIds(res.body)).toEqual([]);
    expect(subjectsSent()).toEqual([OTHER_GUEST]);
  });

  it('loses an account on the very next call after its grant is revoked', async () => {
    const device = guestDevice();

    const before = await get(device, '/mobile/finance/accounts');
    const detailBefore = await get(device, `/mobile/finance/accounts/${SHARED.id}`);
    finance.revoke(GUEST, SHARED.id);
    const after = await get(device, '/mobile/finance/accounts');
    const detailAfter = await get(device, `/mobile/finance/accounts/${SHARED.id}`);

    expect(accountIds(before.body)).toEqual([SHARED.id]);
    expect(detailBefore.status).toBe(200);
    expect(accountIds(after.body)).toEqual([]);
    expect(detailAfter.status).toBe(404);
  });

  it('sees a narrowed role on the next call, because bfm keeps none', async () => {
    const device = guestDevice();

    const before = await get(device, '/mobile/finance/accounts');
    finance.grant(GUEST, SHARED.id, 'view');
    const after = await get(device, '/mobile/finance/accounts');

    expect(before.body.accounts[0].viewerRole).toBe('edit');
    expect(after.body.accounts[0].viewerRole).toBe('view');
  });
});

describe('an operator device', () => {
  it('sends no subject and is served every account, as before guests existed', async () => {
    const res = await get(operatorDevice(), '/mobile/finance/accounts');

    expect(res.status).toBe(200);
    expect(accountIds(res.body)).toEqual([SHARED.id, PRIVATE.id]);
    expect(finance.calls).toEqual([
      { path: '/accounts', subject: undefined, apiKey: SERVICE_ACCOUNT_KEY },
    ]);
  });

  it('sends no subject on the transactions list or the lookups behind it', async () => {
    const res = await get(operatorDevice(), '/mobile/finance/transactions');

    expect(res.body.data.map((row: { id: string }) => row.id)).toEqual([
      'txn-shared',
      'txn-private',
    ]);
    expect(finance.calls).toHaveLength(3);
    expect(subjectsSent()).toEqual([undefined, undefined, undefined]);
  });

  it('is unaffected by a service account that was never re-minted with the delegation scope', async () => {
    finance.setKeyScopes(
      BFM_SERVICE_ACCOUNT_SCOPES.filter((scope) => scope !== 'finance.delegatedSubject')
    );

    const res = await get(operatorDevice(), '/mobile/finance/accounts');

    expect(res.status).toBe(200);
    expect(accountIds(res.body)).toEqual([SHARED.id, PRIVATE.id]);
  });
});

describe('a guest and an operator calling at the same time', () => {
  it('keeps each request on its own subject', async () => {
    const guest = guestDevice();
    const operator = operatorDevice();
    const other = guestDevice(OTHER_GUEST);

    const rounds = await Promise.all(
      Array.from({ length: 8 }, () =>
        Promise.all([
          get(guest, '/mobile/finance/transactions'),
          get(operator, '/mobile/finance/transactions'),
          get(other, '/mobile/finance/accounts'),
          get(operator, '/mobile/finance/accounts'),
          get(guest, '/mobile/finance/accounts'),
        ])
      )
    );

    for (const [
      guestRows,
      operatorRows,
      otherAccounts,
      operatorAccounts,
      guestAccounts,
    ] of rounds) {
      expect(guestRows.body.data.map((row: { id: string }) => row.id)).toEqual(['txn-shared']);
      expect(operatorRows.body.data).toHaveLength(2);
      expect(accountIds(otherAccounts.body)).toEqual([]);
      expect(accountIds(operatorAccounts.body)).toEqual([SHARED.id, PRIVATE.id]);
      expect(accountIds(guestAccounts.body)).toEqual([SHARED.id]);
    }
    // 8 rounds: the guest's page and its one lookup, the operator's page and
    // its two, and three account lists.
    const sent = subjectsSent();
    expect(sent.filter((subject) => subject === GUEST)).toHaveLength(8 * 3);
    expect(sent.filter((subject) => subject === OTHER_GUEST)).toHaveLength(8);
    expect(sent.filter((subject) => subject === undefined)).toHaveLength(8 * 4);
  });
});

describe('what a guest device is told when finance says no', () => {
  it('relays the refusal on the summary as a typed error, never an empty success', async () => {
    const res = await get(guestDevice(), '/mobile/finance/summary');

    expect(res.status).toBe(502);
    const body = MobileUpstreamErrorSchema.parse(res.body);
    expect(body.code).toBe('finance.auth.forbidden');
    expect(body.retryable).toBe(false);
    // The producer's own code is what names the refusal. The SDK folds 401 and
    // 403 into one failure kind, so `upstream.status` cannot tell them apart.
    expect(body.details).toMatchObject({ principal: 'guest', upstream: { pillar: 'finance' } });
    expect(subjectsSent()).toEqual([GUEST]);
  });

  it('answers 404 for an account it was not granted, like one that does not exist', async () => {
    const ungranted = await get(guestDevice(), `/mobile/finance/accounts/${PRIVATE.id}`);
    const missing = await get(guestDevice(), '/mobile/finance/accounts/acc-nope');

    expect(ungranted.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(MobileUpstreamErrorSchema.parse(ungranted.body).code).toBe('finance.resource.not_found');
    expect(ungranted.body.details.upstream).toEqual(missing.body.details.upstream);
  });

  it('answers 404 for a transaction on an account it was not granted', async () => {
    const res = await get(guestDevice(), '/mobile/finance/transactions/txn-private');

    expect(res.status).toBe(404);
    expect(MobileUpstreamErrorSchema.parse(res.body).details.upstream).toEqual({
      pillar: 'finance',
      status: 404,
    });
  });

  it('answers a retryable 503 when finance is down, not an empty list', async () => {
    finance.setOutage(true);

    const res = await get(guestDevice(), '/mobile/finance/accounts');

    expect(res.status).toBe(503);
    const body = MobileUpstreamErrorSchema.parse(res.body);
    expect(body.retryable).toBe(true);
    expect(body.details.upstream).toEqual({ pillar: 'finance', status: 503 });
    expect(res.body.accounts).toBeUndefined();
  });

  it('is refused, not served as the operator, while the service account lacks the delegation scope', async () => {
    finance.setKeyScopes(
      BFM_SERVICE_ACCOUNT_SCOPES.filter((scope) => scope !== 'finance.delegatedSubject')
    );

    const res = await get(guestDevice(), '/mobile/finance/accounts');

    expect(res.status).toBe(502);
    expect(MobileUpstreamErrorSchema.parse(res.body).code).toBe('finance.auth.forbidden');
    expect(res.body.accounts).toBeUndefined();
    expect(subjectsSent()).toEqual([GUEST]);
  });
});

describe('where the subject goes', () => {
  type PeerRouter = { things: { list: (input: Record<string, never>) => Promise<unknown> } };
  type FinanceRouter = { accounts: { list: (input: { limit: number }) => Promise<unknown> } };

  let peer: Server;
  let peerHeaders: Record<string, string | string[] | undefined>[];

  beforeEach(async () => {
    peerHeaders = [];
    peer = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/openapi') {
        res.end(
          JSON.stringify({
            openapi: '3.0.3',
            info: { title: 'purchases', version: '0.1.0' },
            paths: {
              '/things': {
                get: { operationId: 'things.list', responses: { '200': { description: 'ok' } } },
              },
            },
          })
        );
        return;
      }
      peerHeaders.push(req.headers);
      res.end(JSON.stringify({ data: [] }));
    });
    await new Promise<void>((resolve) => {
      peer.listen(0, '127.0.0.1', resolve);
    });
    const address = peer.address();
    if (address === null || typeof address === 'string') throw new Error('no port bound');
    finance.registerPeer('purchases', `http://127.0.0.1:${String(address.port)}`);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      peer.close(() => resolve());
      peer.closeAllConnections();
    });
  });

  it('reaches finance and no other pillar, from the same guest request', async () => {
    const gateway = createPillarGateway();

    const [toPeer, toFinance] = await runWithDeviceSubject(GUEST, () =>
      Promise.all([
        gateway.call<PeerRouter, unknown>('purchases', (handle) => handle.things.list({})),
        gateway.call<FinanceRouter, unknown>('finance', (handle) =>
          handle.accounts.list({ limit: 5 })
        ),
      ])
    );

    expect(toPeer).toMatchObject({ kind: 'ok' });
    expect(toFinance).toMatchObject({ kind: 'ok' });
    expect(peerHeaders).toHaveLength(1);
    expect(peerHeaders[0]?.['x-api-key']).toBe(SERVICE_ACCOUNT_KEY);
    expect(peerHeaders[0]?.['x-pops-subject-email']).toBeUndefined();
    expect(subjectsSent()).toEqual([GUEST]);
  });

  it('refuses to call finance at all for a call that carries no device', async () => {
    const gateway = createPillarGateway();

    await expect(
      gateway.call<FinanceRouter, unknown>('finance', (handle) =>
        handle.accounts.list({ limit: 5 })
      )
    ).rejects.toThrow(/no device subject in scope/);

    expect(finance.calls).toEqual([]);
  });

  it('has no subject to read outside a device request', () => {
    expect(() => currentDeviceSubject()).toThrow(/no device subject in scope/);
    expect(runWithDeviceSubject(null, currentDeviceSubject)).toBeNull();
    expect(runWithDeviceSubject(GUEST, currentDeviceSubject)).toBe(GUEST);
  });
});
