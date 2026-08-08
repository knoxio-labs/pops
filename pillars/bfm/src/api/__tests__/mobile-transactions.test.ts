/**
 * The mobile transaction surface, end to end through the real app, the real
 * gateway and the real wire validation — with only finance's network replaced.
 *
 * Three things are being defended here, and each has a failure mode that is
 * silent rather than loud:
 *
 *   - **The money.** Sign and scale are finance's, mirrored. A flipped sign
 *     shows a refund as a purchase on a phone and nothing anywhere fails.
 *   - **The paging.** A cursor walk must be stable while the list mutates
 *     underneath it, or an infinite scroll quietly repeats and skips rows.
 *   - **The degradation.** Finance being down must never render as an empty
 *     list, which is a lie the user cannot tell from the truth.
 *
 * The wire-shape assertions are exact key sets rather than `toMatchObject`.
 * The iOS client is generated from this document, so an accidental field is a
 * change to a shipped app — it must fail here, deliberately and loudly.
 */
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { createMobileFinanceClient } from '../finance/client.js';
import { createPillarGateway } from '../pillars/gateway.js';
import {
  createFinanceFake,
  createMalformedFinanceFake,
  financeRow,
  type FinanceFake,
  type FinanceFakeRow,
} from './finance-fake.js';
import { createTestApp, type TestApp } from './harness.js';

import type { Express } from 'express';

import type { PillarHandleFactory } from '../pillars/gateway.js';

const LIST_PATH = '/mobile/finance/transactions';

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

function openWithRows(rows: readonly FinanceFakeRow[]): {
  app: Express;
  token: string;
  fake: FinanceFake;
} {
  const fake = createFinanceFake(rows);
  return { ...openWith(fake.factory), fake };
}

function get(app: Express, token: string, path: string) {
  return request(app).get(path).set('Authorization', `Bearer ${token}`);
}

/** Three rows sharing one date plus an older one — ties are the normal case. */
const SEEDED_DATES = ['2026-03-05', '2026-03-05', '2026-03-05', '2026-02-28'] as const;
const seededRows: readonly FinanceFakeRow[] = SEEDED_DATES.map((date, index) =>
  financeRow({ id: `txn-${String(index)}`, date, description: `Row ${String(index)}` })
);

/**
 * `seededRows` under finance's total order: newest date first, then id
 * DESCENDING — so the three rows sharing `2026-03-05` come back 2, 1, 0, and
 * the older `txn-3` last.
 */
const SEEDED_ORDER = ['txn-2', 'txn-1', 'txn-0', 'txn-3'] as const;

describe('the list row is mobile-shaped', () => {
  it('carries exactly the fields a list row renders, and no others', async () => {
    const { app, token } = openWithRows([financeRow({ id: 'txn-1' })]);

    const res = await get(app, token, LIST_PATH);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).toSorted()).toEqual(['data', 'nextCursor']);
    expect(Object.keys(res.body.data[0]).toSorted()).toEqual([
      'amount',
      'currency',
      'date',
      'description',
      'entityName',
      'id',
      'tags',
      'type',
    ]);
  });

  it("does not forward finance's fields that the row does not draw", async () => {
    const { app, token } = openWithRows([financeRow({ id: 'txn-1', notes: 'private note' })]);

    const res = await get(app, token, LIST_PATH);

    const row: Record<string, unknown> = res.body.data[0];
    expect(row['account']).toBeUndefined();
    expect(row['notes']).toBeUndefined();
    expect(row['location']).toBeUndefined();
  });

  it("mirrors finance's amount sign and scale rather than reinterpreting it", async () => {
    const { app, token } = openWithRows([
      financeRow({ id: 'spend', amount: -42.5 }),
      financeRow({ id: 'earn', amount: 1234.56, date: '2026-02-01', type: 'income' }),
    ]);

    const res = await get(app, token, LIST_PATH);

    const byId = new Map<string, { amount: number; currency: string; type: string }>(
      res.body.data.map((row: { id: string }) => [row.id, row])
    );
    expect(byId.get('spend')?.amount).toBe(-42.5);
    expect(byId.get('earn')?.amount).toBe(1234.56);
    // `type` is a semantic label and never the direction — the sign is.
    expect(byId.get('earn')?.type).toBe('income');
  });

  it('states the currency the fleet has always assumed', async () => {
    const { app, token } = openWithRows([financeRow({ id: 'txn-1' })]);

    const res = await get(app, token, LIST_PATH);

    expect(res.body.data[0].currency).toBe('AUD');
  });

  it('passes through an entity-less transaction as null rather than dropping the field', async () => {
    const { app, token } = openWithRows([financeRow({ id: 'txn-1', entityName: null, tags: [] })]);

    const res = await get(app, token, LIST_PATH);

    expect(res.body.data[0].entityName).toBeNull();
    expect(res.body.data[0].tags).toEqual([]);
  });
});

describe('cursor pagination', () => {
  it('asks finance for one row past the page, with no anchor on the first page', async () => {
    const { app, token, fake } = openWithRows(seededRows);

    await get(app, token, `${LIST_PATH}?limit=2`);

    expect(fake.listCalls).toEqual([{ limit: 3, beforeDate: undefined, beforeId: undefined }]);
  });

  it('sends the last served row as the anchor for the next page', async () => {
    const { app, token, fake } = openWithRows(seededRows);

    const first = await get(app, token, `${LIST_PATH}?limit=2`);
    await get(app, token, `${LIST_PATH}?limit=2&cursor=${String(first.body.nextCursor)}`);

    const lastServed = first.body.data.at(-1);
    expect(fake.listCalls[1]).toEqual({
      limit: 3,
      beforeDate: lastServed.date,
      beforeId: lastServed.id,
    });
  });

  it('never serves the probe row it over-fetched', async () => {
    const { app, token } = openWithRows(seededRows);

    const res = await get(app, token, `${LIST_PATH}?limit=2`);

    expect(res.body.data).toHaveLength(2);
  });

  it('terminates the last page with no cursor', async () => {
    const { app, token } = openWithRows(seededRows.slice(0, 2));

    const res = await get(app, token, `${LIST_PATH}?limit=5`);

    expect(res.body.data).toHaveLength(2);
    expect(res.body.nextCursor).toBeNull();
  });

  it('terminates an empty list with no cursor, rather than looping', async () => {
    const { app, token } = openWithRows([]);

    const res = await get(app, token, LIST_PATH);

    expect(res.body).toEqual({ data: [], nextCursor: null });
  });

  it('walks the whole list exactly once when nothing changes', async () => {
    const { app, token } = openWithRows(seededRows);

    const seen = await walkEveryPage(app, token, 2);

    expect(seen).toEqual([...SEEDED_ORDER]);
  });

  it('is unshifted by an insertion at the head between pages', async () => {
    // The failure this replaces: with offset paging, a row arriving at the
    // head pushes everything down one, so page two re-serves the last row of
    // page one and never serves the row that fell past the boundary.
    const { app, token, fake } = openWithRows(seededRows);

    const seen = await walkEveryPage(app, token, 2, (pageIndex) => {
      if (pageIndex === 0) {
        fake.insert(
          financeRow({ id: 'txn-new', date: '2026-04-01', description: 'Just imported' })
        );
      }
    });

    expect(seen).toEqual([...SEEDED_ORDER]);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('separates rows that share a date, so a tie group is not a gap', async () => {
    const { app, token } = openWithRows(seededRows);

    const sameDay = (await walkEveryPage(app, token, 1)).slice(0, 3);

    expect(sameDay).toEqual(SEEDED_ORDER.slice(0, 3));
  });

  it('defaults to a page a phone can render when the app asks for no limit', async () => {
    const { app, token, fake } = openWithRows(seededRows);

    await get(app, token, LIST_PATH);

    expect(fake.listCalls[0]?.limit).toBe(26);
  });

  it('refuses a limit past the contract cap rather than quietly clamping it', async () => {
    const { app, token } = openWithRows(seededRows);

    const res = await get(app, token, `${LIST_PATH}?limit=500`);

    expect(res.status).toBe(400);
  });

  it('rejects a cursor it did not issue instead of silently restarting the list', async () => {
    const { app, token, fake } = openWithRows(seededRows);

    const res = await get(app, token, `${LIST_PATH}?cursor=not-a-real-cursor`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_cursor');
    expect(fake.listCalls).toHaveLength(0);
  });
});

/** Follow `nextCursor` to the end, optionally mutating finance between pages. */
async function walkEveryPage(
  app: Express,
  token: string,
  limit: number,
  betweenPages?: (pageIndex: number) => void
): Promise<string[]> {
  const seen: string[] = [];
  let cursor: string | null = null;

  for (let pageIndex = 0; pageIndex < 20; pageIndex++) {
    const query =
      cursor === null ? `limit=${String(limit)}` : `limit=${String(limit)}&cursor=${cursor}`;
    const res = await get(app, token, `${LIST_PATH}?${query}`);
    expect(res.status).toBe(200);

    seen.push(...res.body.data.map((row: { id: string }) => row.id));
    cursor = res.body.nextCursor;
    if (cursor === null) return seen;
    betweenPages?.(pageIndex);
  }

  throw new Error('the cursor walk did not terminate');
}

describe('the detail record', () => {
  it('carries the fuller record the detail screen needs', async () => {
    const { app, token } = openWithRows([
      financeRow({ id: 'txn-1', notes: 'split with Sam', location: 'Sydney' }),
    ]);

    const res = await get(app, token, `${LIST_PATH}/txn-1`);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).toSorted()).toEqual([
      'account',
      'amount',
      'country',
      'currency',
      'date',
      'description',
      'entityId',
      'entityName',
      'id',
      'lastEditedTime',
      'location',
      'notes',
      'relatedTransactionId',
      'tags',
      'type',
    ]);
    expect(res.body.notes).toBe('split with Sam');
  });

  it('404s a transaction finance does not have', async () => {
    const { app, token } = openWithRows([financeRow({ id: 'txn-1' })]);

    const res = await get(app, token, `${LIST_PATH}/nope`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
    expect(res.body.retryable).toBe(false);
  });
});

describe('finance being unreachable', () => {
  it('answers a typed, retryable 503 — not a 500 and not an empty list', async () => {
    const { app, token } = openWith(
      createFinanceFake([], { kind: 'unavailable', pillar: 'finance' }).factory
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

  it('keeps "mid-recovery" a different answer from "did not answer"', async () => {
    const { app, token } = openWith(
      createFinanceFake([], { kind: 'degraded', pillar: 'finance', reason: 'reconciling' }).factory
    );

    const res = await get(app, token, LIST_PATH);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('upstream_degraded');
    expect(res.body.retryable).toBe(true);
  });

  it('degrades the detail route the same way, rather than 500ing', async () => {
    const { app, token } = openWith(
      createFinanceFake([], { kind: 'unavailable', pillar: 'finance' }).factory
    );

    const res = await get(app, token, `${LIST_PATH}/txn-1`);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('upstream_unavailable');
  });
});

describe('finance answering with something bfm cannot read', () => {
  it('is a non-retryable 502, distinguishable from an outage', async () => {
    const { app, token } = openWith(createMalformedFinanceFake({ items: [] }));

    const res = await get(app, token, LIST_PATH);

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('upstream_contract_mismatch');
    expect(res.body.retryable).toBe(false);
  });

  it('rejects a page whose rows lost a field, rather than serving blanks', async () => {
    // A producer-side rename arrives as a missing key. Rendering that as an
    // empty description on a phone is worse than refusing the page.
    const { app, token } = openWith(
      createMalformedFinanceFake({ data: [{ id: 'txn-1', amount: -1 }] })
    );

    const res = await get(app, token, LIST_PATH);

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('upstream_contract_mismatch');
  });

  it('rejects a full timestamp where finance promised a date-only value', async () => {
    // Half the cursor is that date. A producer that started emitting a
    // timestamp would silently change what "the next page" means.
    const { app, token } = openWith(
      createMalformedFinanceFake({
        data: [{ ...financeRow({ id: 'txn-1' }), date: '2026-03-01T00:00:00.000Z' }],
      })
    );

    const res = await get(app, token, LIST_PATH);

    expect(res.status).toBe(502);
  });

  it('an outage and a mismatch never collapse to the same answer', async () => {
    const outage = openWith(
      createFinanceFake([], { kind: 'unavailable', pillar: 'finance' }).factory
    );
    const mismatch = openWith(createMalformedFinanceFake({}));

    const down = await get(outage.app, outage.token, LIST_PATH);
    const broken = await get(mismatch.app, mismatch.token, LIST_PATH);

    expect(down.status).not.toBe(broken.status);
    expect(down.body.code).not.toBe(broken.body.code);
    expect(down.body.retryable).not.toBe(broken.body.retryable);
  });
});

describe("a sibling rejecting bfm's own credential", () => {
  it('is a 502, so the phone does not refresh a token that is perfectly good', async () => {
    const { app, token } = openWith(
      createFinanceFake([], { kind: 'unauthorized', pillar: 'finance' }).factory
    );

    const res = await get(app, token, LIST_PATH);

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('upstream_misconfigured');
    expect(res.body.retryable).toBe(false);
  });
});

describe('the perimeter still applies', () => {
  it.each([LIST_PATH, `${LIST_PATH}/txn-1`])('401s %s without a token', async (path) => {
    const { app, fake } = openWithRows(seededRows);

    const res = await request(app).get(path);

    expect(res.status).toBe(401);
    expect(fake.listCalls).toHaveLength(0);
  });

  it('403s a revoked device before reaching finance', async () => {
    const fake = createFinanceFake(seededRows);
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
