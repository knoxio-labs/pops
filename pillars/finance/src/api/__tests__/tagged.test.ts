/** Integration tests for Finance's shared-tag carrier routes. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { accountsService, openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { tagVocabulary } from '../../db/schema.js';
import { createFinanceApiApp } from '../app.js';
import { financeScopeMap } from '../middleware/service-account-scope.js';
import { makeContactsFake } from './contacts-fake.js';
import { makeClient, requestOn } from './test-utils.js';

import type { ServiceAccountVerification, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

let tmpDir: string;
let financeDb: OpenedFinanceDb;
let accountId: string;

const SHARED_TAG_ID = 'shared-tag-routing-test';
const SHARED_TAG = 'trip:shared-tag-routing-test';
const KEY = 'pops_sa_abcdefgh.test-key';

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-tagged-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
  accountId = accountsService.createAccount(financeDb.db, {
    name: 'Tagged test account',
    kind: 'checking',
    currency: 'AUD',
  }).id;
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function insertSharedTag(id: string, tag = SHARED_TAG): void {
  const facet = tag.slice(0, tag.indexOf(':'));
  financeDb.db
    .insert(tagVocabulary)
    .values({ tag, facet, kind: 'open', source: 'user', sharedTagId: id, usageCount: 0 })
    .run();
}

function app(
  syncSharedTagsOnce?: () => Promise<unknown>,
  serviceAccountVerifier?: ServiceAccountVerifier
) {
  return createFinanceApiApp({
    financeDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3004',
    contacts: makeContactsFake(),
    ...(syncSharedTagsOnce === undefined ? {} : { syncSharedTagsOnce }),
    ...(serviceAccountVerifier === undefined ? {} : { serviceAccountVerifier }),
  });
}

function client(syncSharedTagsOnce?: () => Promise<unknown>) {
  return makeClient(app(syncSharedTagsOnce));
}

async function createTransaction(description = 'Coffee', date = '2026-04-12') {
  const result = await client().transactions.create({
    description,
    accountId,
    amount: -12.5,
    date,
    type: 'purchase',
  });
  return result.data;
}

describe('tagged carrier routes', () => {
  it('lists, attaches and detaches shared tags through Finance transport', async () => {
    insertSharedTag(SHARED_TAG_ID);
    const transaction = await createTransaction();
    const api = client();

    expect(await api.tagged.attach(transaction.id, SHARED_TAG_ID)).toEqual({
      tagIds: [SHARED_TAG_ID],
    });

    expect(await api.tagged.list({ tagIds: [SHARED_TAG_ID] })).toEqual({
      items: [
        {
          uri: `pops://finance/transaction/${transaction.id}`,
          entityType: 'transaction',
          title: 'Coffee',
          tagIds: [SHARED_TAG_ID],
          date: '2026-04-12',
          amountCents: -1250,
        },
      ],
      nextCursor: null,
    });

    expect(await api.tagged.detach(transaction.id, SHARED_TAG_ID)).toEqual({ tagIds: [] });
    expect(await api.tagged.list({ tagIds: [SHARED_TAG_ID] })).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('encodes and consumes continuation cursors for stable pages', async () => {
    insertSharedTag(SHARED_TAG_ID);
    const first = await createTransaction('First');
    const second = await createTransaction('Second');
    const api = client();
    await api.tagged.attach(first.id, SHARED_TAG_ID);
    await api.tagged.attach(second.id, SHARED_TAG_ID);

    const pageOne = await api.tagged.list({ tagIds: [SHARED_TAG_ID], limit: 1 });
    const pageTwo = await api.tagged.list({
      tagIds: [SHARED_TAG_ID],
      limit: 1,
      cursor: pageOne.nextCursor ?? undefined,
    });

    expect(pageOne.items).toHaveLength(1);
    expect(pageOne.nextCursor).toEqual(expect.any(String));
    expect(pageTwo.items).toHaveLength(1);
    expect(pageTwo.nextCursor).toBeNull();
    expect(pageOne.items[0]?.uri).not.toBe(pageTwo.items[0]?.uri);
  });

  it('rejects an invalid continuation cursor', async () => {
    await expect(
      client().tagged.list({ tagIds: [SHARED_TAG_ID], cursor: 'not-valid-json' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('returns 404 for an unknown transaction without syncing the vocabulary', async () => {
    insertSharedTag(SHARED_TAG_ID);
    const sync = vi.fn(async () => undefined);

    await expect(
      client(sync).tagged.attach('missing-transaction', SHARED_TAG_ID)
    ).rejects.toMatchObject({
      status: 404,
    });
    expect(sync).not.toHaveBeenCalled();
  });

  it('runs one vocabulary sync and retries an initially unknown tag id', async () => {
    const transaction = await createTransaction();
    const sync = vi.fn(async () => insertSharedTag(SHARED_TAG_ID));

    expect(await client(sync).tagged.attach(transaction.id, SHARED_TAG_ID)).toEqual({
      tagIds: [SHARED_TAG_ID],
    });
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('returns 400 after exactly one sync retry for an unknown tag id', async () => {
    const transaction = await createTransaction();
    const sync = vi.fn(async () => undefined);

    await expect(
      client(sync).tagged.attach(transaction.id, 'unknown-shared-tag')
    ).rejects.toMatchObject({
      status: 400,
    });
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when a query has more than 500 ids', async () => {
    const tagIds = Array.from({ length: 501 }, (_, index) => `tag-${index}`);
    await expect(client().tagged.list({ tagIds })).rejects.toMatchObject({ status: 400 });
  });

  it('admits keyless callers and gates a key without finance.tagged', async () => {
    expect((await client().tagged.list({ tagIds: ['unknown-tag'] })).items).toEqual([]);

    const verification: ServiceAccountVerification = {
      outcome: 'authenticated',
      principal: {
        id: 'sa_transactions',
        name: 'transactions-only',
        scopes: ['finance.transactions'],
      },
    };
    const verifier: ServiceAccountVerifier = () => Promise.resolve(verification);
    const response = await requestOn(app(undefined, verifier), (agent) =>
      agent
        .post('/tagged/query')
        .set('x-api-key', KEY)
        .send({ tagIds: ['unknown-tag'] })
    );

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'finance.auth.forbidden' });
  });

  it('derives all three operation scopes from the mounted contract', () => {
    expect(financeScopeMap.routes.map((route) => route.scope)).toEqual(
      expect.arrayContaining([
        'finance.tagged.list',
        'finance.tagged.attach',
        'finance.tagged.detach',
      ])
    );
  });
});
