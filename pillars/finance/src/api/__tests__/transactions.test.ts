/**
 * Integration tests for the `transactions.*` REST surface. Covers the
 * CRUD envelopes, JSON tag parsing on the wire, the delete→restore (Undo)
 * handshake including the duplicate-restore conflict, filter combinations,
 * pagination, and error-status mapping.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, transferPairsService, type OpenedFinanceDb } from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-tx-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createFinanceApiApp({
      financeDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3004',
      contacts: makeContactsFake(),
    })
  );
}

const base = {
  description: 'Coffee',
  account: 'Everyday',
  amount: -4.5,
  date: '2026-01-02',
  type: 'purchase',
};

describe('transactions — happy paths', () => {
  it('creates with tags, parses them to an array on read, and lists', async () => {
    const created = await client().transactions.create({ ...base, tags: ['food', 'coffee'] });
    expect(created.data.tags).toEqual(['food', 'coffee']);
    expect(created.data.amount).toBe(-4.5);

    const fetched = await client().transactions.get(created.data.id);
    expect(fetched.data).toMatchObject({ description: 'Coffee', account: 'Everyday' });

    const listed = await client().transactions.list();
    expect(listed.pagination.total).toBe(1);
    expect(listed.data[0]?.tags).toEqual(['food', 'coffee']);
  });

  it('updates fields', async () => {
    const created = await client().transactions.create(base);
    const updated = await client().transactions.update(created.data.id, {
      description: 'Latte',
      tags: ['coffee'],
    });
    expect(updated.data.description).toBe('Latte');
    expect(updated.data.tags).toEqual(['coffee']);
  });
});

describe('transactions — unlink transfer', () => {
  it('symmetrically unlinks a paired transfer and reverts both legs by direction', async () => {
    const debit = await client().transactions.create({ ...base, amount: -50, account: 'Amex' });
    const credit = await client().transactions.create({ ...base, amount: 50, account: 'Bendigo' });
    // Pairing is gated in prod, so arrange the linked state directly via the service.
    transferPairsService.linkTransferPair(financeDb.db, debit.data.id, credit.data.id);

    const result = await client().transactions.unlinkTransfer(debit.data.id);
    expect(result.data.relatedTransactionId).toBeNull();
    expect(result.data.type).toBe('purchase');

    const creditAfter = await client().transactions.get(credit.data.id);
    expect(creditAfter.data.relatedTransactionId).toBeNull();
    expect(creditAfter.data.type).toBe('income');
  });

  it('404s for a missing transaction', async () => {
    await expect(client().transactions.unlinkTransfer('does-not-exist')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('transactions — delete / restore handshake', () => {
  it('delete returns a raw snapshot; restore re-creates; a second restore conflicts', async () => {
    const created = await client().transactions.create({ ...base, tags: ['food'] });
    const id = created.data.id;

    const deleted = await client().transactions.delete(id);
    expect(deleted.snapshot.id).toBe(id);
    // Snapshot carries the RAW tags JSON string, not the parsed array.
    expect(typeof deleted.snapshot.tags).toBe('string');
    await expect(client().transactions.get(id)).rejects.toMatchObject({ status: 404 });

    const restored = await client().transactions.restore(deleted.snapshot);
    expect(restored.data.id).toBe(id);
    expect(restored.data.tags).toEqual(['food']);

    // Restoring the same snapshot again must conflict — the id now exists.
    await expect(client().transactions.restore(deleted.snapshot)).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('transactions — filters & pagination', () => {
  beforeEach(async () => {
    await client().transactions.create({
      ...base,
      account: 'Everyday',
      type: 'purchase',
      date: '2026-01-01',
    });
    await client().transactions.create({
      ...base,
      description: 'Salary',
      account: 'Savings',
      type: 'income',
      amount: 5000,
      date: '2026-02-01',
    });
    await client().transactions.create({
      ...base,
      description: 'Rent',
      account: 'Everyday',
      type: 'purchase',
      amount: -1500,
      date: '2026-02-15',
    });
  });

  it('filters by account and by type', async () => {
    const everyday = await client().transactions.list({ account: 'Everyday' });
    expect(everyday.pagination.total).toBe(2);

    const income = await client().transactions.list({ type: 'income' });
    expect(income.data.map((t) => t.description)).toEqual(['Salary']);
  });

  it('paginates with limit/offset', async () => {
    const page = await client().transactions.list({ limit: 2, offset: 0 });
    expect(page.data).toHaveLength(2);
    expect(page.pagination).toMatchObject({ total: 3, limit: 2, offset: 0, hasMore: true });
  });

  it('paginates with a beforeDate/beforeId keyset anchor', async () => {
    const first = await client().transactions.list({ limit: 1 });
    const anchor = first.data[0];
    expect(anchor?.description).toBe('Rent');

    const next = await client().transactions.list({
      limit: 2,
      beforeDate: anchor?.date,
      beforeId: anchor?.id,
    });

    expect(next.data.map((t) => t.description)).toEqual(['Salary', 'Coffee']);
  });

  it('400s a keyset anchor missing its other half', async () => {
    await expect(client().transactions.list({ beforeDate: '2026-02-15' })).rejects.toMatchObject({
      status: 400,
    });
    await expect(client().transactions.list({ beforeId: 'some-id' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('refuses an empty anchor rather than silently ending the list', async () => {
    // `date < ''` matches nothing, so an empty pair would answer 200 with zero
    // rows — indistinguishable, to a paging caller, from having reached the
    // end. Verified at the service layer in the db suite; rejected here.
    await expect(
      client().transactions.list({ beforeDate: '', beforeId: '' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('answers a rejected query in the error shape every 400 declares', async () => {
    // ts-rest rejects this ahead of the handler and would otherwise send its
    // own `{ name, issues }`, which the contract does not describe — so a
    // client generated from the document could not decode it.
    const failure = await client()
      .transactions.list({ beforeDate: 'not-a-date', beforeId: 'x' })
      .catch((error: unknown) => error);

    const body = (failure as { body?: Record<string, unknown> }).body ?? {};
    expect(Object.keys(body).toSorted()).toEqual(['code', 'message', 'messageKey']);
    expect(body['messageKey']).toBe('common.validationFailed');
  });

  it('refuses an anchor date that is not a date', async () => {
    // An anchor is compared lexicographically, so a malformed one sorts
    // wherever its characters fall and silently changes which rows come back.
    await expect(
      client().transactions.list({ beforeDate: 'not-a-date', beforeId: 'some-id' })
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      client().transactions.list({ beforeDate: '2026-2-15', beforeId: 'some-id' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('names both halves and which one is missing, on the wire', async () => {
    // The invalid state is the pair, so a caller told only that `beforeDate`
    // is wrong has to guess whether to drop it or to supply its partner. It
    // has to be in `message`: the error envelope carries no details field, so
    // anything put there reaches the logs and nobody else.
    const failure = await client()
      .transactions.list({ beforeDate: '2026-02-15' })
      .catch((error: unknown) => error);

    const body = (failure as { body?: { message?: string } }).body;
    expect(body?.message).toBe(
      'beforeDate and beforeId must be supplied together; beforeId is missing'
    );
  });
});

describe('transactions — error mapping', () => {
  it('404s unknown get / update / delete', async () => {
    await expect(client().transactions.get('nope')).rejects.toMatchObject({ status: 404 });
    await expect(client().transactions.update('nope', { notes: 'x' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(client().transactions.delete('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('400s a create missing required fields', async () => {
    await expect(client().transactions.create({ description: '' })).rejects.toMatchObject({
      status: 400,
    });
  });
});
