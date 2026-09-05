/**
 * The mobile account surface, end to end through the real app, the real
 * gateway and the real wire validation — with only finance's network
 * replaced. See `mobile-transactions.test.ts` for the shared reasoning
 * (money/shape assertions are exact key sets, since the iOS client is
 * generated from this document); this route carries no money and no cursor,
 * so those two concerns of that file do not apply here.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { createMobileFinanceClient } from '../finance/client.js';
import { createPillarGateway } from '../pillars/gateway.js';
import {
  accountRow,
  createAccountsFake,
  createMalformedAccountsFake,
  type AccountFakeRow,
  type AccountsFake,
  type AccountsFakeExtras,
} from './accounts-fake.js';
import { createTestApp, type TestApp } from './harness.js';
import { requestOn } from './test-http.js';

import type { Express } from 'express';

import type { PillarHandleFactory } from '../pillars/gateway.js';

const LIST_PATH = '/mobile/finance/accounts';

const apps: TestApp[] = [];

afterEach(() => {
  while (apps.length > 0) {
    apps.pop()?.cleanup();
  }
});

/** An app wired to `factory`, plus a token for a device that is allowed in. */
function openWith(factory: PillarHandleFactory): { app: Express; token: string } {
  const created = createTestApp({
    finance: createMobileFinanceClient(createPillarGateway(factory)),
  });
  apps.push(created);

  const row = deviceRow();
  created.db.insert(devices).values(row).run();
  const { token } = mintAccessToken(row.id, created.accessTokenSigningKey);

  return { app: created.app, token };
}

function openWithRows(
  rows: readonly AccountFakeRow[],
  extras: AccountsFakeExtras = {}
): {
  app: Express;
  token: string;
  fake: AccountsFake;
} {
  const fake = createAccountsFake(rows, undefined, extras);
  return { ...openWith(fake.factory), fake };
}

function get(app: Express, token: string, path: string) {
  return requestOn(app, (r) => r.get(path).set('Authorization', `Bearer ${token}`));
}

describe('the account row is mobile-shaped', () => {
  it('carries exactly the fields a phone reads, and no others', async () => {
    const { app, token } = openWithRows([accountRow({ id: 'acc-1' })]);

    const res = await get(app, token, LIST_PATH);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).toSorted()).toEqual(['data']);
    expect(Object.keys(res.body.data[0]).toSorted()).toEqual([
      'archived',
      'balance',
      'contact',
      'currency',
      'id',
      'institutionId',
      'institutionName',
      'kind',
      'name',
    ]);
  });

  it('carries a checkpoint-anchored liability balance negative, with anchor stripped', async () => {
    const { app, token } = openWithRows([
      accountRow({
        id: 'amex',
        kind: 'credit-card',
        balance: {
          balanceCents: -213_755,
          asOf: '2026-09-02',
          basis: 'checkpoint',
          anchor: { checkpointId: 'chk-1', asOf: '2026-09-02', source: 'manual' },
          inconsistent: false,
        },
      }),
    ]);

    const res = await get(app, token, LIST_PATH);

    expect(Object.keys(res.body.data[0].balance).toSorted()).toEqual([
      'asOf',
      'balanceCents',
      'basis',
      'inconsistent',
    ]);
    expect(res.body.data[0].balance).toMatchObject({
      balanceCents: -213_755,
      basis: 'checkpoint',
    });
  });

  it('passes through a transactions-basis balance unflattened', async () => {
    const { app, token } = openWithRows([
      accountRow({
        id: 'cash',
        balance: {
          balanceCents: 780_64,
          asOf: '2026-09-05',
          basis: 'transactions',
          anchor: null,
          inconsistent: true,
        },
      }),
    ]);

    const res = await get(app, token, LIST_PATH);

    expect(res.body.data[0].balance).toEqual({
      balanceCents: 780_64,
      asOf: '2026-09-05',
      basis: 'transactions',
      inconsistent: true,
    });
  });

  it('collapses archivedAt to a plain boolean', async () => {
    const { app, token } = openWithRows([
      accountRow({ id: 'active', archivedAt: null }),
      accountRow({ id: 'gone', archivedAt: '2026-01-01T00:00:00.000Z' }),
    ]);

    const res = await get(app, token, LIST_PATH);

    const byId = new Map<string, { archived: boolean }>(
      res.body.data.map((row: { id: string }) => [row.id, row])
    );
    expect(byId.get('active')?.archived).toBe(false);
    expect(byId.get('gone')?.archived).toBe(true);
  });

  it('returns active and archived accounts alike, unfiltered', async () => {
    const { app, token } = openWithRows([
      accountRow({ id: 'active', archivedAt: null }),
      accountRow({ id: 'gone', archivedAt: '2026-01-01T00:00:00.000Z' }),
    ]);

    const res = await get(app, token, LIST_PATH);

    expect(res.body.data).toHaveLength(2);
  });

  it('passes through a null institutionId rather than dropping the field', async () => {
    const { app, token } = openWithRows([accountRow({ id: 'acc-1', institutionId: null })]);

    const res = await get(app, token, LIST_PATH);

    expect(res.body.data[0].institutionId).toBeNull();
  });

  it('asks finance for the whole list in one page, at the contract cap', async () => {
    const { app, token, fake } = openWithRows([accountRow({ id: 'acc-1' })]);

    await get(app, token, LIST_PATH);

    expect(fake.listCalls).toEqual([{ limit: 500 }]);
  });
});

describe('getting one account', () => {
  it('returns the matching row', async () => {
    const { app, token } = openWithRows([
      accountRow({ id: 'acc-1', name: 'Everyday' }),
      accountRow({ id: 'acc-2', name: 'Savings' }),
    ]);

    const res = await get(app, token, `${LIST_PATH}/acc-2`);

    expect(res.status).toBe(200);
    expect(res.body.account.name).toBe('Savings');
  });

  it('is a typed 404 for an id finance does not have', async () => {
    const { app, token } = openWithRows([]);

    const res = await get(app, token, `${LIST_PATH}/missing`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
    expect(res.body.retryable).toBe(false);
  });
});

describe('finance being unreachable', () => {
  it('answers a typed, retryable 503 — not a 500 and not an empty list', async () => {
    const { app, token } = openWith(
      createAccountsFake([], { kind: 'unavailable', pillar: 'finance' }).factory
    );

    const res = await get(app, token, LIST_PATH);

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      code: 'upstream_unavailable',
      pillar: 'finance',
      retryable: true,
    });
    expect(res.body.data).toBeUndefined();
  });

  it('degrades the get route the same way, rather than 500ing', async () => {
    const { app, token } = openWith(
      createAccountsFake([], { kind: 'unavailable', pillar: 'finance' }).factory
    );

    const res = await get(app, token, `${LIST_PATH}/acc-1`);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('upstream_unavailable');
  });
});

describe('finance answering with something bfm cannot read', () => {
  it('is a non-retryable 502, distinguishable from an outage', async () => {
    const { app, token } = openWith(createMalformedAccountsFake({ items: [] }));

    const res = await get(app, token, LIST_PATH);

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('upstream_contract_mismatch');
    expect(res.body.retryable).toBe(false);
  });

  it('rejects a row that lost a field, rather than serving a blank', async () => {
    const { app, token } = openWith(createMalformedAccountsFake({ data: [{ id: 'acc-1' }] }));

    const res = await get(app, token, LIST_PATH);

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('upstream_contract_mismatch');
  });

  it('does not let a 404 escape the LIST route, which never declares one', async () => {
    const fake = createAccountsFake([], { kind: 'not-found', pillar: 'finance' });
    const { app, token } = openWith(fake.factory);

    const res = await get(app, token, LIST_PATH);

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('upstream_contract_mismatch');
  });
});

describe("a sibling rejecting bfm's own credential", () => {
  it('is a 502, so the phone does not refresh a token that is perfectly good', async () => {
    const { app, token } = openWith(
      createAccountsFake([], { kind: 'unauthorized', pillar: 'finance' }).factory
    );

    const res = await get(app, token, LIST_PATH);

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('upstream_misconfigured');
    expect(res.body.retryable).toBe(false);
  });
});

describe('the perimeter still applies', () => {
  it.each([LIST_PATH, `${LIST_PATH}/acc-1`])('401s %s without a token', async (path) => {
    const { app, fake } = openWithRows([accountRow({ id: 'acc-1' })]);

    const res = await requestOn(app, (r) => r.get(path));

    expect(res.status).toBe(401);
    expect(fake.listCalls).toHaveLength(0);
  });

  it('403s a revoked device before reaching finance', async () => {
    const fake = createAccountsFake([accountRow({ id: 'acc-1' })]);
    const created = createTestApp({
      finance: createMobileFinanceClient(createPillarGateway(fake.factory)),
    });
    apps.push(created);
    const row = { ...deviceRow(), revokedAt: '2026-03-01T00:00:00.000Z' };
    created.db.insert(devices).values(row).run();
    const { token } = mintAccessToken(row.id, created.accessTokenSigningKey);

    const res = await get(created.app, token, LIST_PATH);

    expect(res.status).toBe(403);
    expect(fake.listCalls).toHaveLength(0);
  });
});

describe('the institution behind an account (POPS-2848)', () => {
  it('resolves the name finance holds against the id on the row', async () => {
    const { app, token } = openWithRows([accountRow({ id: 'acc-1', institutionId: 'inst-anz' })], {
      institutions: [
        { id: 'inst-up', name: 'Up' },
        { id: 'inst-anz', name: 'ANZ' },
      ],
    });

    const res = await get(app, token, LIST_PATH);

    expect(res.status).toBe(200);
    expect(res.body.data[0].institutionName).toBe('ANZ');
  });

  it('leaves the name null for an id the institutions list does not contain', async () => {
    const { app, token } = openWithRows([accountRow({ id: 'acc-1', institutionId: 'inst-gone' })], {
      institutions: [{ id: 'inst-up', name: 'Up' }],
    });

    const res = await get(app, token, LIST_PATH);

    expect(res.status).toBe(200);
    expect(res.body.data[0].institutionId).toBe('inst-gone');
    expect(res.body.data[0].institutionName).toBeNull();
  });

  it('still serves every balance when the institutions lookup does not come back', async () => {
    const { app, token } = openWithRows(
      [
        accountRow({
          id: 'acc-1',
          institutionId: 'inst-anz',
          balance: {
            balanceCents: -213_755,
            asOf: '2026-09-02',
            basis: 'checkpoint',
            anchor: { checkpointId: 'chk-1', asOf: '2026-09-02', source: 'manual' },
            inconsistent: false,
          },
        }),
      ],
      { institutionsFailWith: { kind: 'unavailable', pillar: 'finance' } }
    );

    const res = await get(app, token, LIST_PATH);

    expect(res.status).toBe(200);
    expect(res.body.data[0].balance.balanceCents).toBe(-213_755);
    expect(res.body.data[0].institutionName).toBeNull();
  });

  it('does not ask finance for institutions when no account is held at one', async () => {
    const { app, token, fake } = openWithRows([
      accountRow({ id: 'cash', kind: 'cash', institutionId: null }),
    ]);

    const res = await get(app, token, LIST_PATH);

    expect(res.status).toBe(200);
    expect(fake.institutionCalls).toHaveLength(0);
  });

  it("carries a person ledger's contact through as `contact`", async () => {
    const { app, token } = openWithRows([
      accountRow({ id: 'acc-jo', kind: 'person', entityDisplayName: 'Jo' }),
    ]);

    const res = await get(app, token, LIST_PATH);

    expect(res.status).toBe(200);
    expect(res.body.data[0].contact).toBe('Jo');
  });
});

describe("one account's balance history (POPS-2848)", () => {
  it('carries the month-end series finance answers with, oldest first', async () => {
    const { app, token, fake } = openWithRows([accountRow({ id: 'acc-1' })], {
      history: {
        'acc-1': [
          { month: '2026-07', balanceCents: 1_000 },
          { month: '2026-08', balanceCents: 2_500 },
        ],
      },
    });

    const res = await get(app, token, `${LIST_PATH}/acc-1`);

    expect(res.status).toBe(200);
    expect(res.body.history).toEqual([
      { month: '2026-07', balanceCents: 1_000 },
      { month: '2026-08', balanceCents: 2_500 },
    ]);
    expect(fake.historyCalls).toEqual([{ id: 'acc-1', months: 12 }]);
  });

  it('is an empty series, not a failure, when the history lookup does not come back', async () => {
    const { app, token } = openWithRows([accountRow({ id: 'acc-1', name: 'Everyday' })], {
      historyFailWith: { kind: 'unavailable', pillar: 'finance' },
    });

    const res = await get(app, token, `${LIST_PATH}/acc-1`);

    expect(res.status).toBe(200);
    expect(res.body.account.name).toBe('Everyday');
    expect(res.body.history).toEqual([]);
  });

  it('is not fetched at all when the account itself is not found', async () => {
    const { app, token, fake } = openWithRows([]);

    const res = await get(app, token, `${LIST_PATH}/missing`);

    expect(res.status).toBe(404);
    expect(fake.historyCalls).toHaveLength(0);
  });
});
