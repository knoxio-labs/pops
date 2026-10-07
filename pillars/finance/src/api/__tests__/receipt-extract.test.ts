/**
 * Integration tests for reading a receipt into a suggested entry (POPS-5871).
 * Real Express app, real SQLite file, real signed Access tokens, and an
 * in-memory receipt store in place of the purchases pillar.
 *
 * The route tier is the cheapest one that sees this: the answer depends on who
 * the scope gate resolved the request to, on the grant held on the account
 * named in the body, and on which of the store's two calls finance falls back
 * to when the first gives no reading.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ACCESS_JWT_HEADER } from '@pops/pillar-express';
import { createAccessJwtFixture } from '@pops/pillar-sdk/testing';

import { accountGrantsService, openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { createAccount } from '../../db/services/accounts.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';
import {
  type FakeReading,
  makePurchasesFake,
  type PurchasesFake,
  receiptUriOf,
} from './purchases-fake.js';
import { requestOn } from './test-utils.js';

import type { ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const AUDIENCE = 'aud-under-test';
const access = createAccessJwtFixture({ audience: AUDIENCE });

const OPERATOR = 'owner@pops.test';
/** Holds `view` on the shared account only. */
const ROSANE = 'rosane@example.test';
/** Holds `edit` on the shared account. */
const CARLOS = 'carlos@example.test';
const API_KEY = 'pops_sa_abcdefgh.a-secret-that-never-leaves-this-file';

const PHOTO = { mediaType: 'image/jpeg', dataBase64: Buffer.from('a photo').toString('base64') };
const SECOND_PHOTO = {
  mediaType: 'image/png',
  dataBase64: Buffer.from('the rest of it').toString('base64'),
};

/** 22:30 UTC on the 1st, which is 09:30 on the 2nd in Sydney's summer. */
const SYDNEY_MORNING = { orderedAt: '2026-03-01T22:30:00Z', orderedAtOffsetMinutes: 660 };

function aDraft(overrides: Partial<Extract<FakeReading, { kind: 'draft' }>['draft']> = {}) {
  return {
    kind: 'draft' as const,
    draft: {
      ...SYDNEY_MORNING,
      currency: 'AUD',
      totalCents: 4250,
      merchantEntityName: 'Woolworths',
      ...overrides,
    },
  };
}

const financeWideKey: ServiceAccountVerifier = () =>
  Promise.resolve({
    outcome: 'authenticated',
    principal: { id: 'sa_bfm', name: 'bfm', scopes: ['finance'] },
  });

let tmpDir: string;
let financeDb: OpenedFinanceDb;
let purchases: PurchasesFake;
/** AUD. Granted to Rosane (`view`) and Carlos (`edit`). */
let shared: string;
/** AUD. Granted to nobody. */
let privateAccount: string;

function enforceAccess(): void {
  vi.stubEnv('POPS_OPERATOR_EMAILS', OPERATOR);
  vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', access.teamName);
  vi.stubEnv('CLOUDFLARE_ACCESS_AUD', AUDIENCE);
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-receipt-extract-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
  purchases = makePurchasesFake();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', access.fetchImpl);
  vi.stubEnv('POPS_OPERATOR_EMAILS', '');
  vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', '');
  vi.stubEnv('CLOUDFLARE_ACCESS_AUD', '');

  const account = (name: string) =>
    createAccount(financeDb.db, { name, kind: 'checking', currency: 'AUD' }).id;
  shared = account('Shared');
  privateAccount = account('Private');

  const grant = (email: string, role: 'view' | 'edit') =>
    accountGrantsService.upsertGrant(financeDb.db, {
      accountId: shared,
      email,
      role,
      actor: OPERATOR,
    });
  grant(ROSANE, 'view');
  grant(CARLOS, 'edit');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

interface Caller {
  /** Email to sign an Access token for. */
  readonly as?: string;
  /** Present an `X-API-Key` the registry resolves to a finance-wide grant. */
  readonly withKey?: boolean;
}

function extract(caller: Caller, body: object) {
  const app = createFinanceApiApp({
    financeDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3004',
    contacts: makeContactsFake(),
    purchases,
    serviceAccountVerifier: financeWideKey,
  });
  return requestOn(app, (agent) => {
    let req = agent.post('/transactions/receipt-extract');
    if (caller.as !== undefined) req = req.set(ACCESS_JWT_HEADER, access.signForEmail(caller.as));
    if (caller.withKey === true) req = req.set('x-api-key', API_KEY);
    return req.send(body);
  });
}

const operations = () => purchases.calls.map((made) => made.operation);

/** Every row finance could have written, so "nothing was written" is one comparison. */
function written(): unknown {
  const all = (table: string) => financeDb.raw.prepare(`SELECT * FROM ${table}`).all();
  return {
    transactions: all('transactions'),
    attachments: all('transaction_attachments'),
    events: all('transaction_events'),
  };
}

describe('a receipt purchases can read', () => {
  beforeEach(enforceAccess);

  it('suggests the day at the shop, the merchant and the total as money out', async () => {
    purchases.willRead(aDraft());

    const response = await extract({ as: CARLOS }, { accountId: shared, parts: [PHOTO] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        outcome: 'suggested',
        receiptUris: [receiptUriOf(PHOTO)],
        suggestion: {
          date: '2026-03-02',
          description: 'Woolworths',
          amountCents: -4250,
          currency: 'AUD',
          currencyMismatch: false,
        },
      },
    });
  });

  it.each([
    ['UTC when the reading resolved no offset', { orderedAtOffsetMinutes: null }, '2026-03-01'],
    [
      'the day before for a shop behind UTC',
      {
        orderedAt: '2026-03-02T01:30:00Z',
        orderedAtOffsetMinutes: -180,
      },
      '2026-03-01',
    ],
    [
      'the printed offset form of the same instant',
      {
        orderedAt: '2026-03-02T09:30:00+11:00',
        orderedAtOffsetMinutes: 660,
      },
      '2026-03-02',
    ],
  ])('dates the entry in %s', async (_what, overrides, date) => {
    purchases.willRead(aDraft(overrides));

    const response = await extract({ as: CARLOS }, { accountId: shared, parts: [PHOTO] });

    expect(response.body.data.suggestion.date).toBe(date);
  });

  it('suggests a refund receipt as money in', async () => {
    purchases.willRead(aDraft({ totalCents: -1999 }));

    const response = await extract({ as: CARLOS }, { accountId: shared, parts: [PHOTO] });

    expect(response.body.data.suggestion.amountCents).toBe(1999);
  });

  it('leaves the description empty for a receipt that names no merchant', async () => {
    purchases.willRead(aDraft({ merchantEntityName: null }));

    const response = await extract({ as: CARLOS }, { accountId: shared, parts: [PHOTO] });

    expect(response.body.data.suggestion.description).toBeNull();
  });

  it('flags a receipt in a currency the account is not in, and keeps its figure', async () => {
    purchases.willRead(aDraft({ currency: 'BRL', totalCents: 18990 }));

    const response = await extract({ as: CARLOS }, { accountId: shared, parts: [PHOTO] });

    expect(response.body.data.suggestion).toMatchObject({
      amountCents: -18990,
      currency: 'BRL',
      currencyMismatch: true,
    });
  });

  it('answers every file of a receipt photographed in parts, in order', async () => {
    purchases.willRead(aDraft());

    const response = await extract(
      { as: CARLOS },
      { accountId: shared, parts: [SECOND_PHOTO, PHOTO] }
    );

    expect(response.body.data.receiptUris).toEqual([
      receiptUriOf(SECOND_PHOTO),
      receiptUriOf(PHOTO),
    ]);
  });

  it('creates no transaction, attachment, event or pin', async () => {
    purchases.willRead(aDraft());
    const before = written();

    await extract({ as: CARLOS }, { accountId: shared, parts: [PHOTO] });

    expect(written()).toEqual(before);
    expect(operations()).toEqual(['extract']);
  });
});

describe('a receipt that yields no suggestion', () => {
  beforeEach(enforceAccess);

  it('answers unreadable with the stored files and no suggestion', async () => {
    purchases.willRead({ kind: 'unreadable' });

    const response = await extract({ as: CARLOS }, { accountId: shared, parts: [PHOTO] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { outcome: 'unreadable', receiptUris: [receiptUriOf(PHOTO)] },
    });
    expect(operations()).toEqual(['extract']);
  });

  it('stores the files itself and answers unavailable when purchases has no reader', async () => {
    purchases.willRead({ kind: 'no-reader' });

    const response = await extract({ as: CARLOS }, { accountId: shared, parts: [PHOTO] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { outcome: 'unavailable', receiptUris: [receiptUriOf(PHOTO)] },
    });
    expect(operations()).toEqual(['extract', 'store']);
  });

  it('answers already-a-purchase with the stored files and nothing about the purchase', async () => {
    purchases.willRead({ kind: 'already-a-purchase' });

    const response = await extract({ as: CARLOS }, { accountId: shared, parts: [PHOTO] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { outcome: 'already-a-purchase', receiptUris: [receiptUriOf(PHOTO)] },
    });
  });

  it.each<FakeReading['kind']>(['unreadable', 'no-reader', 'already-a-purchase'])(
    'writes nothing and pins nothing on %s',
    async (kind) => {
      purchases.willRead({ kind });
      const before = written();

      await extract({ as: CARLOS }, { accountId: shared, parts: [PHOTO] });

      expect(written()).toEqual(before);
      expect(operations()).not.toContain('addReferences');
    }
  );
});

describe('who may ask', () => {
  beforeEach(() => {
    enforceAccess();
    purchases.willRead(aDraft());
  });

  it('answers 403 to a guest who holds view on the account, and sends purchases nothing', async () => {
    const response = await extract({ as: ROSANE }, { accountId: shared, parts: [PHOTO] });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('finance.resource.forbidden');
    expect(purchases.calls).toEqual([]);
  });

  it('answers a guest 404 for an account they were not granted, as for one that does not exist', async () => {
    const ungranted = await extract({ as: CARLOS }, { accountId: privateAccount, parts: [PHOTO] });
    const missing = await extract({ as: CARLOS }, { accountId: 'no-such-id', parts: [PHOTO] });

    expect(ungranted.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(ungranted.body.code).toBe(missing.body.code);
    expect(purchases.calls).toEqual([]);
  });

  it('answers the operator 404 for an account that does not exist', async () => {
    const response = await extract({ as: OPERATOR }, { accountId: 'no-such-id', parts: [PHOTO] });

    expect(response.status).toBe(404);
    expect(purchases.calls).toEqual([]);
  });

  it.each<[string, Caller]>([
    ['the operator', { as: OPERATOR }],
    ['a service account', { withKey: true }],
  ])('reads for %s on an account nobody was granted', async (_who, caller) => {
    const response = await extract(caller, { accountId: privateAccount, parts: [PHOTO] });

    expect(response.status).toBe(200);
    expect(response.body.data.outcome).toBe('suggested');
  });
});

describe('with no operator list set', () => {
  beforeEach(() => purchases.willRead(aDraft()));

  it('reads for a caller with no token', async () => {
    const response = await extract({}, { accountId: privateAccount, parts: [PHOTO] });

    expect(response.status).toBe(200);
    expect(response.body.data.outcome).toBe('suggested');
  });

  it('treats any signed-in email as the operator, whatever grant it holds', async () => {
    const onViewOnly = await extract({ as: ROSANE }, { accountId: shared, parts: [PHOTO] });
    const onUngranted = await extract(
      { as: ROSANE },
      { accountId: privateAccount, parts: [PHOTO] }
    );

    expect(onViewOnly.status).toBe(200);
    expect(onUngranted.status).toBe(200);
  });
});

describe('what the route refuses', () => {
  beforeEach(enforceAccess);

  it('answers a typed 503 and writes nothing when purchases cannot be reached at all', async () => {
    const before = written();
    purchases.setUnavailable(true);

    const response = await extract({ as: CARLOS }, { accountId: shared, parts: [PHOTO] });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      code: 'finance.dependency.unavailable',
      retryable: true,
    });
    expect(written()).toEqual(before);
  });

  it('answers 503 when the reading failed and the store then went away too', async () => {
    purchases.willRead({ kind: 'no-reader' });
    purchases.onCall((made) => {
      if (made.operation === 'store') purchases.setUnavailable(true);
    });

    const response = await extract({ as: CARLOS }, { accountId: shared, parts: [PHOTO] });

    expect(response.status).toBe(503);
  });

  it('answers 400 for a file the store will not take', async () => {
    const response = await extract(
      { as: CARLOS },
      { accountId: shared, parts: [{ mediaType: 'text/html', dataBase64: 'PGI+' }] }
    );

    expect(response.status).toBe(400);
  });

  it.each([
    ['no files', (accountId: string) => ({ accountId, parts: [] })],
    ['no account', () => ({ parts: [PHOTO] })],
    [
      'a field it does not know',
      (accountId: string) => ({
        accountId,
        parts: [PHOTO],
        transactionId: 'x',
      }),
    ],
  ])('answers 400 for a body with %s, before purchases is asked', async (_what, body) => {
    const response = await extract({ as: CARLOS }, body(shared));

    expect(response.status).toBe(400);
    expect(purchases.calls).toEqual([]);
  });
});
