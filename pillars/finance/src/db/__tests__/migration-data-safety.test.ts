/**
 * What the whole migration chain does to data that was already there.
 *
 * Every other test in this pillar opens a database that was empty when the
 * migrations ran, so a chain that drops rows, nullifies a column or breaks a
 * foreign key passes all of them and is discovered against the live file —
 * where finance keeps the one dataset nobody can re-derive.
 *
 * The shape: bring a database up to the baseline pair (0053 + 0054) from a
 * truncated journal, write representative rows through raw SQL, then reopen it
 * with the real opener, which applies every entry after that point. The tail
 * covers the two migration kinds most likely to lose data —
 * `0064_money_integer_cents` renames and retypes `transactions.amount` into
 * `amount_cents`, and `0065_transaction_type_lowercase` rewrites the `type` of
 * every row — plus two table rebuilds (`0057`, `0061`) that copy every row
 * through a new table definition.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readMigrationJournal, stageMigrationsThrough } from '@pops/pillar-sdk/db';

import { openFinanceDb, registerFinanceSqlFunctions } from '../open-finance-db.js';

import type { OpenedFinanceDb } from '../open-finance-db.js';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);

/** The last entry that exists before anything under test has run. */
const BASELINE_TAG = '0054_finance_pillar_baseline_extension';

interface SeededTransaction {
  readonly id: string;
  readonly description: string;
  readonly amount: number;
  readonly date: string;
  readonly type: string;
  readonly tags: readonly string[];
  readonly entityId: string | null;
  readonly notes: string | null;
}

/**
 * Rows shaped the way a real import wrote them: floats that do not survive
 * naive scaling (`19.99 * 100` is `1998.9999999999998`), a JSON column, a
 * foreign key into `entities`, and one row of each legacy capitalised `type`.
 */
const TRANSACTIONS: readonly SeededTransaction[] = [
  {
    id: 't-groceries',
    description: 'WOOLWORTHS 1234',
    amount: -19.99,
    date: '2026-01-02',
    type: 'Expense',
    tags: ['groceries', 'weekly-shop'],
    entityId: 'e-woolworths',
    notes: null,
  },
  {
    id: 't-salary',
    description: 'ACME PAYROLL',
    amount: 4200.5,
    date: '2026-01-15',
    type: 'Income',
    tags: [],
    entityId: null,
    notes: null,
  },
  {
    id: 't-move',
    description: 'TRANSFER TO SAVINGS',
    amount: -100.1,
    date: '2026-01-16',
    type: 'Transfer',
    tags: ['internal'],
    entityId: null,
    notes: null,
  },
  {
    id: 't-odd-type',
    description: 'UNKNOWN THING',
    amount: -0.05,
    date: '2026-01-17',
    // Neither a legacy display value nor a taxonomy value. 0065 must land it
    // on the default rather than leave it as-is.
    type: '',
    tags: ['uncategorised'],
    entityId: null,
    notes: null,
  },
  {
    // 0066 lifts this note into typed columns. The space-separated thousands of
    // a zero-decimal currency are the shape a naive backfill drops in silence.
    id: 't-tokyo',
    description: 'AOMORI GROCER',
    amount: -12.4,
    date: '2026-02-01',
    type: 'Expense',
    tags: ['travel'],
    entityId: null,
    notes: '1 100 JPY, 0.40 AUD fx fee',
  },
  {
    // 0066 must not touch this one — it is the user's own text.
    id: 't-user-note',
    description: 'HARDWARE STORE',
    amount: -80.0,
    date: '2026-02-02',
    type: 'Expense',
    tags: [],
    entityId: null,
    notes: 'Warranty expires 2028 — receipt in the drawer',
  },
];

const CORRECTIONS = [
  { id: 'c-woolies', pattern: 'WOOLWORTHS%', entityId: 'e-woolworths', confidence: 0.5 },
  { id: 'c-payroll', pattern: 'ACME PAYROLL', entityId: null, confidence: 0.95 },
] as const;

let dir: string;
let dbPath: string;
let opened: OpenedFinanceDb;

function seedThroughBaseline(): void {
  const staged = stageMigrationsThrough({
    migrationsFolder: MIGRATIONS_DIR,
    through: BASELINE_TAG,
    targetFolder: join(dir, 'staged-migrations'),
  });

  const raw = new Database(dbPath);
  raw.pragma('foreign_keys = ON');
  registerFinanceSqlFunctions(raw);
  migrate(drizzle(raw), { migrationsFolder: staged });

  raw
    .prepare(
      `INSERT INTO entities (id, name, type, last_edited_time)
       VALUES (?, ?, 'company', '2026-01-01T00:00:00Z')`
    )
    .run('e-woolworths', 'Woolworths');

  for (const row of TRANSACTIONS) {
    raw
      .prepare(
        `INSERT INTO transactions
           (id, description, account, amount, date, type, tags, entity_id, notes, checksum, last_edited_time)
         VALUES (?, ?, 'everyday', ?, ?, ?, ?, ?, ?, ?, '2026-01-20T00:00:00Z')`
      )
      .run(
        row.id,
        row.description,
        row.amount,
        row.date,
        row.type,
        JSON.stringify(row.tags),
        row.entityId,
        row.notes,
        `checksum-${row.id}`
      );
  }

  for (const rule of CORRECTIONS) {
    raw
      .prepare(
        `INSERT INTO transaction_corrections (id, description_pattern, entity_id, confidence)
         VALUES (?, ?, ?, ?)`
      )
      .run(rule.id, rule.pattern, rule.entityId, rule.confidence);
  }

  raw
    .prepare(
      `INSERT INTO budgets (id, category, period, amount, last_edited_time)
       VALUES ('b-food', 'Food', '2026-01', 650.25, '2026-01-01T00:00:00Z')`
    )
    .run();
  raw
    .prepare(
      `INSERT INTO wish_list (id, item, target_amount, saved, last_edited_time)
       VALUES ('w-bike', 'Gravel bike', 2999.99, 250.5, '2026-01-01T00:00:00Z')`
    )
    .run();

  raw.close();
}

function rows<T>(sql: string): T[] {
  return opened.raw.prepare(sql).all() as T[];
}

function count(table: string): number {
  return (opened.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
}

function amountCentsOf(id: string): number {
  return (
    opened.raw.prepare(`SELECT amount_cents FROM transactions WHERE id = ?`).get(id) as {
      amount_cents: number;
    }
  ).amount_cents;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'finance-migration-safety-'));
  dbPath = join(dir, 'finance.db');
  seedThroughBaseline();
  opened = openFinanceDb(dbPath);
});

afterEach(() => {
  opened.raw.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('applying the rest of the journal to a populated finance database', () => {
  it('applies every remaining entry exactly once', () => {
    const applied = rows<{ created_at: number }>(
      `SELECT created_at FROM __drizzle_migrations ORDER BY created_at`
    );
    expect(applied).toHaveLength(readMigrationJournal(MIGRATIONS_DIR).length);
  });

  it('loses no rows from any seeded table', () => {
    expect(count('transactions')).toBe(TRANSACTIONS.length);
    expect(count('transaction_corrections')).toBe(CORRECTIONS.length);
    expect(count('budgets')).toBe(1);
    expect(count('wish_list')).toBe(1);
  });

  it('leaves the pre-migration snapshot behind only if it failed', () => {
    // It did not fail — the reopen above returned. The directory holding the
    // database must therefore be back to just the database and its WAL.
    expect(readdirSync(dir).filter((name) => name.includes('.pre-migration-'))).toEqual([]);
  });

  it('preserves every money value under its renamed column', () => {
    const stored = new Map(
      rows<{ id: string; amount_cents: number }>(`SELECT id, amount_cents FROM transactions`).map(
        (row) => [row.id, row.amount_cents]
      )
    );
    for (const row of TRANSACTIONS) {
      expect(stored.get(row.id), row.id).toBe(Math.round(row.amount * 100));
    }
  });

  it('carries the float cases across without drift', () => {
    // The reason the rename exists. A cast without the ROUND would store
    // -1998 for -19.99 and -10009 for -100.10.
    expect(amountCentsOf('t-groceries')).toBe(-1999);
    expect(amountCentsOf('t-move')).toBe(-10010);
    expect(amountCentsOf('t-salary')).toBe(420050);
  });

  it('leaves no column holding the old name or the old type', () => {
    const columns = rows<{ name: string; type: string }>(`PRAGMA table_info(transactions)`);
    const byName = new Map(columns.map((column) => [column.name, column.type]));
    expect(byName.has('amount')).toBe(false);
    expect(byName.get('amount_cents')?.toLowerCase()).toBe('integer');
  });

  it('keeps every non-money column intact', () => {
    const stored = rows<{ id: string; description: string; date: string; account: string }>(
      `SELECT id, description, date, account FROM transactions`
    );
    expect(stored.map((row) => [row.id, row.description, row.date, row.account])).toEqual(
      TRANSACTIONS.map((row) => [row.id, row.description, row.date, 'everyday'])
    );
  });

  it('leaves every JSON column parseable and unchanged', () => {
    const stored = rows<{ id: string; tags: string }>(`SELECT id, tags FROM transactions`);
    for (const row of stored) {
      const seeded = TRANSACTIONS.find((candidate) => candidate.id === row.id);
      expect(() => JSON.parse(row.tags) as unknown).not.toThrow();
      expect(JSON.parse(row.tags)).toEqual(seeded?.tags);
    }
  });

  it('backfills the type taxonomy without inventing values', () => {
    const stored = new Map(
      rows<{ id: string; type: string }>(`SELECT id, type FROM transactions`).map((row) => [
        row.id,
        row.type,
      ])
    );
    expect(stored.get('t-groceries')).toBe('purchase');
    expect(stored.get('t-salary')).toBe('income');
    expect(stored.get('t-move')).toBe('transfer');
    expect(stored.get('t-odd-type')).toBe('purchase');
  });

  it('does not rewrite an existing value to a newly-raised default', () => {
    // 0061 raises the `confidence` default from 0.5 to 0.7. A rebuild that
    // took the new default for existing rows would silently activate rules
    // their author had deliberately left inert.
    const stored = new Map(
      rows<{ id: string; confidence: number }>(
        `SELECT id, confidence FROM transaction_corrections`
      ).map((row) => [row.id, row.confidence])
    );
    expect(stored.get('c-woolies')).toBe(0.5);
    expect(stored.get('c-payroll')).toBe(0.95);
  });

  it('carries the columns a rebuild has to copy by name', () => {
    // 0061 rebuilds this table by listing every column. Dropping one from
    // either list silently nulls it for every existing row.
    const stored = rows<{ is_active: number; priority: number; description_pattern: string }>(
      `SELECT is_active, priority, description_pattern FROM transaction_corrections ORDER BY id`
    );
    expect(stored.map((row) => row.description_pattern)).toEqual(
      [...CORRECTIONS].sort((a, b) => a.id.localeCompare(b.id)).map((rule) => rule.pattern)
    );
    for (const row of stored) {
      expect(row.is_active).toBe(1);
      expect(row.priority).toBe(0);
    }
  });

  it('lifts an importer-authored fx note into the typed columns and clears it', () => {
    const stored = rows<{
      foreign_amount_minor: number | null;
      foreign_currency: string | null;
      fx_fee_cents: number | null;
      notes: string | null;
    }>(
      `SELECT foreign_amount_minor, foreign_currency, fx_fee_cents, notes
       FROM transactions WHERE id = 't-tokyo'`
    );
    expect(stored).toEqual([
      { foreign_amount_minor: 1100, foreign_currency: 'JPY', fx_fee_cents: 40, notes: null },
    ]);
  });

  it('leaves a user-authored note byte-identical', () => {
    const stored = rows<{ notes: string | null }>(
      `SELECT notes FROM transactions WHERE id = 't-user-note'`
    );
    expect(stored).toEqual([
      { notes: TRANSACTIONS.find((row) => row.id === 't-user-note')?.notes },
    ]);
  });

  it('leaves no broken foreign key anywhere in the database', () => {
    // 0057 rebuilds three tables to drop their FK into `entities` and then
    // drops that table. A rebuild that copied rows in the wrong order, or
    // dropped the parent first, shows up here and nowhere else.
    expect(rows(`PRAGMA foreign_key_check`)).toEqual([]);
    expect(rows(`PRAGMA integrity_check`)).toEqual([{ integrity_check: 'ok' }]);
  });

  it('keeps the entity reference on the row that carried one', () => {
    const stored = rows<{ id: string; entity_id: string | null }>(
      `SELECT id, entity_id FROM transactions`
    );
    const byId = new Map(stored.map((row) => [row.id, row.entity_id]));
    expect(byId.get('t-groceries')).toBe('e-woolworths');
    expect(byId.get('t-salary')).toBeNull();
  });
});
