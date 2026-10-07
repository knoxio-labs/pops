/**
 * 0123_shared_account_tables (POPS-5863): what the migration does to a ledger
 * that already holds data, and what the three tables it creates refuse.
 *
 * The populated half stages the journal through 0122, writes accounts,
 * transactions and checkpoints, then reopens with the real opener so 0123 is
 * the only entry applied to them. The constraint half runs against real
 * SQLite with foreign keys on, because a cascade and a CHECK are properties of
 * the engine and nothing short of it can report one missing.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { stageMigrationsThrough } from '@pops/pillar-sdk/db';

import { openFinanceDb, registerFinanceSqlFunctions } from '../open-finance-db.js';
import { accountGrants, transactionAttachments, transactionEvents } from '../schema.js';
import { balancesFor } from '../services/account-balance.js';
import { insertCheckpoint } from '../services/account-checkpoints.js';
import { createAccount } from '../services/accounts.js';
import { mergeAccounts } from '../services/merge-accounts.js';
import { createTransaction, deleteTransaction } from '../services/transactions.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

import type { OpenedFinanceDb } from '../open-finance-db.js';
import type { FinanceDb } from '../services/internal.js';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);

const NEW_TABLES = ['account_grants', 'transaction_events', 'transaction_attachments'] as const;
const AS_OF = '2026-03-31';

function wholeTable(raw: Database.Database, table: string): unknown[] {
  return raw.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
}

function count(raw: Database.Database, table: string): number {
  return (raw.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
}

describe('0123 applied to a populated ledger', () => {
  let dir: string;
  let opened: OpenedFinanceDb;
  let accountIds: string[];
  let before: {
    accounts: unknown[];
    transactions: unknown[];
    checkpoints: unknown[];
    balances: unknown[];
    tables: string[];
  };

  function balances(db: FinanceDb): unknown[] {
    return [...balancesFor(db, accountIds, AS_OF).entries()].toSorted(([a], [b]) =>
      a.localeCompare(b)
    );
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'finance-shared-account-tables-'));
    const dbPath = join(dir, 'finance.db');
    const staged = stageMigrationsThrough({
      migrationsFolder: MIGRATIONS_DIR,
      through: '0122_tag_vocabulary_shared_tag_id',
      targetFolder: join(dir, 'staged-migrations'),
    });

    const raw = new Database(dbPath);
    raw.pragma('foreign_keys = ON');
    registerFinanceSqlFunctions(raw);
    const db = drizzle(raw);
    migrate(db, { migrationsFolder: staged });

    const everyday = createAccount(db, { name: 'Everyday', kind: 'checking', currency: 'AUD' }).id;
    const person = createAccount(db, {
      name: 'Rosane',
      kind: 'person',
      currency: 'AUD',
      entityId: 'contact-rosane',
    }).id;
    accountIds = [everyday, person];
    createTransaction(db, {
      description: 'ACME PAYROLL',
      accountId: everyday,
      amountCents: 420_050,
      date: '2026-01-15',
      type: 'income',
    });
    createTransaction(db, {
      description: 'WOOLWORTHS 1234',
      accountId: everyday,
      amountCents: -1_999,
      date: '2026-02-02',
      type: 'purchase',
    });
    createTransaction(db, {
      description: 'Dinner she paid for',
      accountId: person,
      amountCents: -8_000,
      date: '2026-02-10',
      type: 'purchase',
    });
    insertCheckpoint(db, {
      accountId: everyday,
      balanceCents: 400_000,
      asOf: '2026-01-31',
      source: 'manual',
    });

    before = {
      accounts: wholeTable(raw, 'accounts'),
      transactions: wholeTable(raw, 'transactions'),
      checkpoints: wholeTable(raw, 'account_checkpoints'),
      balances: balances(db),
      tables: (
        raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as {
          name: string;
        }[]
      ).map((table) => table.name),
    };
    raw.close();

    opened = openFinanceDb(dbPath);
  });

  afterEach(() => {
    opened.raw.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('starts from a ledger that did not have the tables', () => {
    // Guards the fixture: were the staging cut to drift past 0123, every
    // assertion below would compare the migration's output with itself.
    for (const table of NEW_TABLES) expect(before.tables).not.toContain(table);
    expect(before.accounts.length).toBeGreaterThanOrEqual(2);
    expect(before.transactions).toHaveLength(3);
    expect(before.checkpoints).toHaveLength(1);
  });

  it('leaves accounts, transactions and checkpoints byte-identical', () => {
    expect(wholeTable(opened.raw, 'accounts')).toEqual(before.accounts);
    expect(wholeTable(opened.raw, 'transactions')).toEqual(before.transactions);
    expect(wholeTable(opened.raw, 'account_checkpoints')).toEqual(before.checkpoints);
  });

  it('leaves every balance where it was', () => {
    expect(balances(opened.db)).toEqual(before.balances);
  });

  it('creates all three tables empty, so no existing account gains a grant', () => {
    for (const table of NEW_TABLES) expect(count(opened.raw, table), table).toBe(0);
  });

  it('leaves no broken foreign key behind', () => {
    expect(opened.raw.prepare(`PRAGMA foreign_key_check`).all()).toEqual([]);
    expect(opened.raw.prepare(`PRAGMA integrity_check`).all()).toEqual([{ integrity_check: 'ok' }]);
  });
});

describe('the shared-account tables on real SQLite', () => {
  let db: FinanceDb;
  let raw: Database.Database;
  let accountId: string;
  let transactionId: string;

  beforeEach(() => {
    ({ db, raw } = freshMigratedFinanceDb());
    accountId = createAccount(db, {
      name: 'Rosane',
      kind: 'person',
      currency: 'AUD',
      entityId: 'contact-rosane',
    }).id;
    transactionId = createTransaction(db, {
      description: 'Dinner',
      accountId,
      amountCents: -8_000,
      date: '2026-02-10',
      type: 'purchase',
    }).id;
  });

  afterEach(() => {
    raw.close();
  });

  function grant(email: string, role: 'view' | 'edit', account = accountId): void {
    db.insert(accountGrants).values({ email, accountId: account, role }).run();
  }

  describe('account_grants', () => {
    it('round-trips a grant through the drizzle schema with its defaults', () => {
      grant('rosane@example.com', 'edit');
      const [row] = db.select().from(accountGrants).all();
      expect(row).toMatchObject({
        email: 'rosane@example.com',
        accountId,
        role: 'edit',
        createdBy: null,
      });
      expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(row?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('rejects a second grant for the same email and account', () => {
      grant('rosane@example.com', 'view');
      expect(() => grant('rosane@example.com', 'edit')).toThrow(/UNIQUE constraint failed/);
    });

    it('allows the same email on another account, and another email on the same account', () => {
      const other = createAccount(db, { name: 'Shared card', kind: 'checking', currency: 'AUD' });
      grant('rosane@example.com', 'view');
      grant('rosane@example.com', 'edit', other.id);
      grant('someone-else@example.com', 'view');
      expect(count(raw, 'account_grants')).toBe(3);
    });

    it('rejects a role outside view and edit', () => {
      const insert = raw.prepare(
        `INSERT INTO account_grants (id, email, account_id, role) VALUES (?, ?, ?, ?)`
      );
      expect(() => insert.run('g-1', 'rosane@example.com', accountId, 'admin')).toThrow(
        /CHECK constraint failed/
      );
      expect(() => insert.run('g-2', 'rosane@example.com', accountId, 'VIEW')).toThrow(
        /CHECK constraint failed/
      );
      expect(count(raw, 'account_grants')).toBe(0);
    });

    it('rejects an email that is not lower-cased, so one address cannot hold two grants', () => {
      grant('rosane@example.com', 'view');
      expect(() => grant('Rosane@Example.com', 'edit')).toThrow(/CHECK constraint failed/);
    });

    it('rejects a grant for an account that does not exist', () => {
      expect(() => grant('rosane@example.com', 'view', 'no-such-account')).toThrow(
        /FOREIGN KEY constraint failed/
      );
    });

    it('cascades with its account and leaves other accounts grants alone', () => {
      const kept = createAccount(db, { name: 'Kept', kind: 'checking', currency: 'AUD' }).id;
      const doomed = createAccount(db, { name: 'Doomed', kind: 'checking', currency: 'AUD' }).id;
      grant('rosane@example.com', 'view', kept);
      grant('rosane@example.com', 'edit', doomed);

      raw.prepare(`DELETE FROM accounts WHERE id = ?`).run(doomed);

      expect(db.select().from(accountGrants).all()).toMatchObject([{ accountId: kept }]);
    });

    it('drops the source account grants on a merge and creates none on the target', () => {
      const target = createAccount(db, {
        name: 'Target',
        kind: 'person',
        currency: 'AUD',
        entityId: 'contact-target',
      }).id;
      grant('rosane@example.com', 'edit');

      mergeAccounts(db, accountId, target);

      expect(count(raw, 'account_grants')).toBe(0);
    });
  });

  describe('transaction_events', () => {
    const insert = (action: string, actorKind: string): void => {
      raw
        .prepare(
          `INSERT INTO transaction_events (id, transaction_id, account_id, action, actor_kind)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(crypto.randomUUID(), transactionId, accountId, action, actorKind);
    };

    it('accepts every action and every actor kind the log is defined over', () => {
      for (const action of ['create', 'update', 'delete', 'restore', 'attach', 'detach']) {
        insert(action, 'operator');
      }
      for (const actorKind of ['guest', 'service', 'system']) insert('update', actorKind);
      expect(count(raw, 'transaction_events')).toBe(9);
    });

    it('rejects an unknown action', () => {
      expect(() => insert('void', 'operator')).toThrow(/CHECK constraint failed/);
      expect(count(raw, 'transaction_events')).toBe(0);
    });

    it('rejects an unknown actor kind', () => {
      expect(() => insert('create', 'admin')).toThrow(/CHECK constraint failed/);
      expect(count(raw, 'transaction_events')).toBe(0);
    });

    it('survives deleting its transaction, snapshot intact', () => {
      const snapshot = JSON.stringify({ id: transactionId, amountCents: -8_000 });
      db.insert(transactionEvents)
        .values({
          transactionId,
          accountId,
          action: 'delete',
          actorKind: 'guest',
          actorEmail: 'rosane@example.com',
          before: snapshot,
        })
        .run();

      deleteTransaction(db, transactionId);

      expect(count(raw, 'transactions')).toBe(0);
      expect(
        db
          .select()
          .from(transactionEvents)
          .where(eq(transactionEvents.transactionId, transactionId))
          .all()
      ).toMatchObject([
        { action: 'delete', actorKind: 'guest', before: snapshot, after: null, accountId },
      ]);
    });

    it('survives deleting its account', () => {
      const doomed = createAccount(db, { name: 'Doomed', kind: 'checking', currency: 'AUD' }).id;
      db.insert(transactionEvents)
        .values({
          transactionId: 't-gone',
          accountId: doomed,
          action: 'create',
          actorKind: 'system',
        })
        .run();

      raw.prepare(`DELETE FROM accounts WHERE id = ?`).run(doomed);

      expect(count(raw, 'transaction_events')).toBe(1);
    });

    it('indexes both lookups the history reads use', () => {
      const indexes = (
        raw.prepare(`PRAGMA index_list('transaction_events')`).all() as { name: string }[]
      ).map((index) => index.name);
      expect(indexes).toEqual(
        expect.arrayContaining([
          'idx_transaction_events_transaction_at',
          'idx_transaction_events_account_at',
        ])
      );
      const columns = (name: string): string[] =>
        (raw.prepare(`PRAGMA index_info('${name}')`).all() as { name: string }[]).map(
          (column) => column.name
        );
      expect(columns('idx_transaction_events_transaction_at')).toEqual(['transaction_id', 'at']);
      expect(columns('idx_transaction_events_account_at')).toEqual(['account_id', 'at']);
    });
  });

  describe('transaction_attachments', () => {
    function attach(documentUri: string, position: number, transaction = transactionId): void {
      db.insert(transactionAttachments)
        .values({ transactionId: transaction, documentUri, mediaType: 'image/jpeg', position })
        .run();
    }

    it('rejects the same document twice on one transaction', () => {
      attach('pops://purchases/receipt/r-1', 0);
      expect(() => attach('pops://purchases/receipt/r-1', 1)).toThrow(/UNIQUE constraint failed/);
    });

    it('allows one document on two transactions', () => {
      const second = createTransaction(db, {
        description: 'Lunch',
        accountId,
        amountCents: -2_500,
        date: '2026-02-11',
        type: 'purchase',
      }).id;
      attach('pops://purchases/receipt/r-1', 0);
      attach('pops://purchases/receipt/r-1', 0, second);
      expect(count(raw, 'transaction_attachments')).toBe(2);
    });

    it('rejects an attachment for a transaction that does not exist', () => {
      expect(() => attach('pops://purchases/receipt/r-1', 0, 'no-such-transaction')).toThrow(
        /FOREIGN KEY constraint failed/
      );
    });

    it('cascades with its transaction and leaves other transactions attachments alone', () => {
      const kept = createTransaction(db, {
        description: 'Lunch',
        accountId,
        amountCents: -2_500,
        date: '2026-02-11',
        type: 'purchase',
      }).id;
      attach('pops://purchases/receipt/r-1', 0);
      attach('pops://purchases/receipt/r-2', 1);
      attach('pops://purchases/receipt/r-3', 0, kept);

      deleteTransaction(db, transactionId);

      expect(db.select().from(transactionAttachments).all()).toMatchObject([
        { transactionId: kept, documentUri: 'pops://purchases/receipt/r-3', createdBy: null },
      ]);
    });
  });
});
