/**
 * DB-layer tests for the transaction audit log (POPS-5865), against an
 * in-memory SQLite carrying the migrated finance schema.
 *
 * This tier owns what a route cannot see directly: that the event and the row
 * change share one database transaction, and that a stored snapshot is the
 * exact row `restoreTransaction` takes.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { freshMigratedFinanceDb } from '../../__tests__/migrated-db.js';
import { PositiveAmountPurchaseError } from '../../errors.js';
import { transactionEvents } from '../../schema.js';
import { createAccount } from '../accounts.js';
import {
  listAccountEvents,
  listTransactionEvents,
  parseTransactionSnapshot,
  recordTransactionEvent,
  type TransactionActor,
} from '../transaction-events.js';
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  restoreTransaction,
  updateTransaction,
  type CreateTransactionInput,
  type TransactionRow,
} from '../transactions.js';

import type Database from 'better-sqlite3';

import type { FinanceDb } from '../internal.js';

const OPERATOR: TransactionActor = { kind: 'operator', email: 'owner@pops.test' };
const GUEST: TransactionActor = { kind: 'guest', email: 'rosane@example.test' };

let db: FinanceDb;
let raw: Database.Database;
let shared: string;
let other: string;

beforeEach(() => {
  ({ db, raw } = freshMigratedFinanceDb());
  shared = createAccount(db, { name: 'Shared', kind: 'checking', currency: 'AUD' }).id;
  other = createAccount(db, { name: 'Other', kind: 'savings', currency: 'AUD' }).id;
});

function dinner(overrides: Partial<CreateTransactionInput> = {}): CreateTransactionInput {
  return {
    description: 'Dinner',
    accountId: shared,
    amountCents: -8_000,
    date: '2026-02-10',
    type: 'purchase',
    ...overrides,
  };
}

const allEvents = () => db.select().from(transactionEvents).all();
const countRows = (table: string): unknown =>
  raw.prepare(`SELECT count(*) AS n FROM ${table}`).get();

describe('the four writers, given an actor', () => {
  it('create records one event: no before, the created row after', () => {
    const created = createTransaction(db, dinner(), OPERATOR);

    const events = allEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      transactionId: created.id,
      accountId: shared,
      action: 'create',
      actorKind: 'operator',
      actorEmail: 'owner@pops.test',
      before: null,
    });
    expect(parseTransactionSnapshot(events[0]?.after ?? '')).toEqual(created);
  });

  it('update records one event with the row either side of the change', () => {
    const created = createTransaction(db, dinner());
    const updated = updateTransaction(db, created.id, { amountCents: -9_500 }, GUEST);

    const events = allEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      transactionId: created.id,
      action: 'update',
      actorKind: 'guest',
      actorEmail: 'rosane@example.test',
    });
    expect(parseTransactionSnapshot(events[0]?.before ?? '')).toEqual(created);
    expect(parseTransactionSnapshot(events[0]?.after ?? '')).toEqual(updated);
    expect(updated.amountCents).toBe(-9_500);
  });

  it('delete records one event: the deleted row before, nothing after', () => {
    const created = createTransaction(db, dinner());
    deleteTransaction(db, created.id, OPERATOR);

    const events = allEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      transactionId: created.id,
      accountId: shared,
      action: 'delete',
      actorKind: 'operator',
      after: null,
    });
    expect(parseTransactionSnapshot(events[0]?.before ?? '')).toEqual(created);
  });

  it('restore records one event: no before, the restored row after', () => {
    const created = createTransaction(db, dinner());
    const snapshot = deleteTransaction(db, created.id);
    restoreTransaction(db, snapshot, GUEST);

    const events = allEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      transactionId: created.id,
      action: 'restore',
      actorKind: 'guest',
      actorEmail: 'rosane@example.test',
      before: null,
    });
    expect(parseTransactionSnapshot(events[0]?.after ?? '')).toEqual(created);
  });

  it.each([
    ['a service, which has no email', { kind: 'service', email: null }],
    ['the system', { kind: 'system', email: null }],
    ['an operator with no sign-in', { kind: 'operator', email: null }],
  ] satisfies [string, TransactionActor][])('records %s as given', (_label, actor) => {
    createTransaction(db, dinner(), actor);
    expect(allEvents()).toMatchObject([{ actorKind: actor.kind, actorEmail: null }]);
  });
});

describe('a write that records nothing', () => {
  it('writes no event when no actor is named', () => {
    const created = createTransaction(db, dinner());
    updateTransaction(db, created.id, { notes: 'split three ways' });
    restoreTransaction(db, deleteTransaction(db, created.id));

    expect(allEvents()).toEqual([]);
  });

  it('writes no event for a create the service refuses', () => {
    expect(() => createTransaction(db, dinner({ amountCents: 8_000 }), OPERATOR)).toThrow(
      PositiveAmountPurchaseError
    );

    expect(allEvents()).toEqual([]);
    expect(countRows('transactions')).toEqual({ n: 0 });
  });

  it('writes no event for an update the service refuses, and leaves the row alone', () => {
    const created = createTransaction(db, dinner());

    expect(() => updateTransaction(db, created.id, { amountCents: 8_000 }, OPERATOR)).toThrow(
      PositiveAmountPurchaseError
    );

    expect(allEvents()).toEqual([]);
    expect(getTransaction(db, created.id)).toEqual(created);
  });

  it('writes no event for an update that changes nothing', () => {
    const created = createTransaction(db, dinner());
    updateTransaction(db, created.id, {}, OPERATOR);

    expect(allEvents()).toEqual([]);
  });

  it('writes no event for a delete of a missing transaction', () => {
    expect(() => deleteTransaction(db, 'no-such-transaction', OPERATOR)).toThrow();
    expect(allEvents()).toEqual([]);
  });

  it('writes no event for a restore over a row that still exists', () => {
    const created = createTransaction(db, dinner());
    expect(() => restoreTransaction(db, created, OPERATOR)).toThrow();
    expect(allEvents()).toEqual([]);
  });
});

describe('the event and the row change share one database transaction', () => {
  beforeEach(() => {
    raw.exec('DROP TABLE transaction_events');
  });

  it('a create whose event cannot be written leaves no transaction', () => {
    expect(() => createTransaction(db, dinner(), OPERATOR)).toThrow(/transaction_events/);
    expect(countRows('transactions')).toEqual({ n: 0 });
  });

  it('an update whose event cannot be written leaves the row as it was', () => {
    const created = createTransaction(db, dinner());

    expect(() => updateTransaction(db, created.id, { amountCents: -1 }, OPERATOR)).toThrow(
      /transaction_events/
    );
    expect(getTransaction(db, created.id)).toEqual(created);
  });

  it('a delete whose event cannot be written leaves the row in place', () => {
    const created = createTransaction(db, dinner());

    expect(() => deleteTransaction(db, created.id, OPERATOR)).toThrow(/transaction_events/);
    expect(getTransaction(db, created.id)).toEqual(created);
  });

  it('a restore whose event cannot be written restores nothing', () => {
    const snapshot = deleteTransaction(db, createTransaction(db, dinner()).id);

    expect(() => restoreTransaction(db, snapshot, OPERATOR)).toThrow(/transaction_events/);
    expect(countRows('transactions')).toEqual({ n: 0 });
  });
});

describe('a delete event rebuilds the entry', () => {
  function importedRow(): TransactionRow {
    const created = createTransaction(
      db,
      dinner({
        tags: ['venue:restaurant'],
        entityId: 'ent-trattoria',
        entityName: 'Trattoria',
        location: 'Carlton',
        country: 'AU',
        notes: 'split three ways',
        rawRow: '{"Description":"TRATTORIA CARLTON"}',
        checksum: 'chk-trattoria',
      })
    );
    // A classification edit stamps the match columns, which a snapshot must carry too.
    return updateTransaction(db, created.id, { entityName: 'Trattoria Carlton' });
  }

  it('round-trips the stored snapshot through restoreTransaction to an identical row', () => {
    const original = importedRow();
    deleteTransaction(db, original.id, OPERATOR);

    const [event] = listTransactionEvents(db, original.id);
    const restored = restoreTransaction(db, parseTransactionSnapshot(event?.before ?? ''));

    expect(restored).toEqual(original);
    expect(restored).toMatchObject({
      rawRow: '{"Description":"TRATTORIA CARLTON"}',
      checksum: 'chk-trattoria',
      matchType: 'manual',
      tags: '["venue:restaurant"]',
    });
  });

  it('refuses a snapshot that is not a complete transaction row', () => {
    expect(() => parseTransactionSnapshot('{"id":"t-1","amountCents":-8000}')).toThrow();
    expect(() => parseTransactionSnapshot('not json')).toThrow();
  });
});

describe('recordTransactionEvent', () => {
  it('refuses an event with neither a before nor an after row', () => {
    expect(() =>
      recordTransactionEvent(db, { action: 'update', actor: OPERATOR, before: null, after: null })
    ).toThrow(/before or an after/);
    expect(allEvents()).toEqual([]);
  });
});

describe('listTransactionEvents', () => {
  it('returns one transaction’s events newest first, and none of another’s', () => {
    const first = createTransaction(db, dinner(), OPERATOR);
    createTransaction(db, dinner({ description: 'Lunch' }), OPERATOR);
    updateTransaction(db, first.id, { notes: 'a' }, GUEST);
    deleteTransaction(db, first.id, OPERATOR);

    expect(listTransactionEvents(db, first.id).map((event) => event.action)).toEqual([
      'delete',
      'update',
      'create',
    ]);
    expect(listTransactionEvents(db, 'no-such-transaction')).toEqual([]);
  });
});

describe('listAccountEvents', () => {
  it('files a move under the new account and finds it from both', () => {
    const created = createTransaction(db, dinner(), OPERATOR);
    updateTransaction(db, created.id, { accountId: other }, OPERATOR);
    const elsewhere = createAccount(db, { name: 'Elsewhere', kind: 'cash', currency: 'AUD' }).id;

    const fromOld = listAccountEvents(db, shared, { limit: 50, offset: 0 });
    const fromNew = listAccountEvents(db, other, { limit: 50, offset: 0 });

    expect(fromOld.rows.map((event) => [event.action, event.accountId])).toEqual([
      ['update', other],
      ['create', shared],
    ]);
    expect(fromOld.total).toBe(2);
    expect(fromNew.rows.map((event) => [event.action, event.accountId])).toEqual([
      ['update', other],
    ]);
    expect(fromNew.total).toBe(1);
    expect(listAccountEvents(db, elsewhere, { limit: 50, offset: 0 })).toEqual({
      rows: [],
      total: 0,
    });
  });

  it('keeps the events of a deleted transaction', () => {
    const created = createTransaction(db, dinner(), OPERATOR);
    deleteTransaction(db, created.id, GUEST);

    const page = listAccountEvents(db, shared, { limit: 50, offset: 0 });
    expect(page.rows.map((event) => event.action)).toEqual(['delete', 'create']);
    expect(page.total).toBe(2);
  });

  it('pages newest first without repeating or dropping an event at a boundary', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'].map(
      (description) => createTransaction(db, dinner({ description }), OPERATOR).id
    );
    const newestFirst = ids.toReversed();

    const pageOne = listAccountEvents(db, shared, { limit: 2, offset: 0 });
    const pageTwo = listAccountEvents(db, shared, { limit: 2, offset: 2 });
    const pageThree = listAccountEvents(db, shared, { limit: 2, offset: 4 });

    expect(
      [...pageOne.rows, ...pageTwo.rows, ...pageThree.rows].map((e) => e.transactionId)
    ).toEqual(newestFirst);
    expect([pageOne.rows.length, pageTwo.rows.length, pageThree.rows.length]).toEqual([2, 2, 1]);
    expect([pageOne.total, pageTwo.total, pageThree.total]).toEqual([5, 5, 5]);
    expect(listAccountEvents(db, shared, { limit: 2, offset: 5 })).toEqual({ rows: [], total: 5 });
    expect(listAccountEvents(db, shared, { limit: 5, offset: 0 }).rows).toHaveLength(5);
  });
});
