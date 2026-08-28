/**
 * Migration test for 0070_fee_and_transfer_types (POPS-2610).
 *
 * Seeds the rows the ticket measured on capivara — the six fee descriptors, the
 * untagged `CHARGE FOR OVERDUE PAYMENT`, a gift-card purchase, an inbound
 * `PayID Payment Received` — plus the rows that must NOT move (a coffee at "Fee
 * Street Cafe", a row someone already typed by hand) and asserts the backfill
 * types each one and leaves the rest alone.
 *
 * The last suite is the one that earns its keep: the migration's SQL patterns
 * and `classifyFromDescription`'s are two copies of the same rules, and the
 * copies must agree or an imported fee and a backfilled fee end up different
 * rows. It derives its descriptors from the exported pattern tables, so a
 * pattern added to the classifier without a matching migration clause fails
 * here instead of quietly halving the backfill.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  classifyFromDescription,
  FEE_PATTERNS,
  INBOUND_TRANSFER_PATTERNS,
} from '../../contract/transaction-classification.js';

/**
 * Pinned by hand to the shape `transactions` had before 0070, so the seeded rows
 * carry the pre-migration typing the backfill rewrites. Deriving it from the
 * journal would feed the migration its own output.
 */
const PRE_MIGRATION_DDL = `
CREATE TABLE tag_vocabulary (
  tag text PRIMARY KEY NOT NULL,
  facet text,
  kind text NOT NULL DEFAULT 'open',
  usage_count integer NOT NULL DEFAULT 0
);
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  description text NOT NULL,
  account text NOT NULL,
  amount_cents integer NOT NULL,
  date text NOT NULL,
  type text NOT NULL,
  tags text NOT NULL DEFAULT '[]',
  last_edited_time text NOT NULL
);
`;

function migrationSql(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(
    join(here, '..', '..', '..', 'migrations', '0070_fee_and_transfer_types.sql'),
    'utf8'
  );
}

let raw: Database.Database;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(PRE_MIGRATION_DDL);
});

afterEach(() => {
  raw.close();
});

interface SeedRow {
  id: string;
  description: string;
  type?: string;
  tags?: string[];
  amountCents?: number;
}

function seed({ id, description, type = 'purchase', tags = [], amountCents = -1000 }: SeedRow) {
  raw
    .prepare(
      `INSERT INTO transactions (id, description, account, amount_cents, date, type, tags, last_edited_time)
       VALUES (?, ?, 'Amex', ?, '2026-05-10', ?, ?, '2026-05-10T00:00:00Z')`
    )
    .run(id, description, amountCents, type, JSON.stringify(tags));
}

function rowOf(id: string): { type: string; tags: string[] } {
  const row = raw.prepare('SELECT type, tags FROM transactions WHERE id = ?').get(id) as {
    type: string;
    tags: string;
  };
  return { type: row.type, tags: JSON.parse(row.tags) as string[] };
}

describe('0070_fee_and_transfer_types — fees', () => {
  it('types the measured fee rows and gives each exactly one fee: value', () => {
    seed({ id: 'membership', description: 'MEMBERSHIP FEE', tags: ['contains:fee'] });
    seed({ id: 'interest', description: 'INTEREST CHARGES', tags: ['contains:fee'] });
    seed({ id: 'interest-purchases', description: 'INTEREST CHARGED ON PURCHASES' });
    seed({ id: 'overdue', description: 'CHARGE FOR OVERDUE PAYMENT' });

    raw.exec(migrationSql());

    expect(rowOf('membership')).toEqual({
      type: 'fee',
      tags: ['contains:fee', 'fee:membership'],
    });
    expect(rowOf('interest')).toEqual({ type: 'fee', tags: ['contains:fee', 'fee:interest'] });
    expect(rowOf('interest-purchases')).toEqual({ type: 'fee', tags: ['fee:interest'] });
    // The row nobody tagged is the whole argument for typing from the descriptor.
    expect(rowOf('overdue')).toEqual({ type: 'fee', tags: ['fee:late'] });
  });

  it('replaces a stale fee: value instead of adding a second one', () => {
    seed({ id: 'stale', description: 'INTEREST CHARGES', tags: ['fee:late', 'contains:fee'] });

    raw.exec(migrationSql());

    expect(rowOf('stale')).toEqual({ type: 'fee', tags: ['contains:fee', 'fee:interest'] });
  });

  it('types a $0 fee row like any other', () => {
    seed({ id: 'zero', description: 'ANNUAL FEE', amountCents: 0 });

    raw.exec(migrationSql());

    expect(rowOf('zero')).toEqual({ type: 'fee', tags: ['fee:membership'] });
  });

  it('leaves a merchant whose name merely contains "fee" alone', () => {
    seed({ id: 'cafe', description: 'FEE STREET CAFE', tags: ['contains:coffee'] });
    seed({ id: 'coffee', description: 'COFFEE CLUB SYDNEY' });

    raw.exec(migrationSql());

    expect(rowOf('cafe')).toEqual({ type: 'purchase', tags: ['contains:coffee'] });
    expect(rowOf('coffee')).toEqual({ type: 'purchase', tags: [] });
  });

  it('folds case and hyphens the way the classifier does', () => {
    seed({ id: 'mixed', description: 'Interest-Charges' });

    raw.exec(migrationSql());

    expect(rowOf('mixed')).toEqual({ type: 'fee', tags: ['fee:interest'] });
  });
});

describe('0070_fee_and_transfer_types — transfers', () => {
  it('reclassifies gift-card purchases and keeps the descriptor tag', () => {
    seed({
      id: 'gift',
      description: 'WOOLWORTHS GIFT CARDS',
      tags: ['contains:gift-card', 'contains:groceries'],
    });

    raw.exec(migrationSql());

    expect(rowOf('gift')).toEqual({
      type: 'transfer',
      tags: ['contains:gift-card', 'contains:groceries'],
    });
  });

  it('leaves a gift-card row that is not a purchase as authored', () => {
    seed({
      id: 'gift-refund',
      description: 'GIFT CARD REFUND',
      type: 'refund',
      tags: ['contains:gift-card'],
    });

    raw.exec(migrationSql());

    expect(rowOf('gift-refund').type).toBe('refund');
  });

  it('types inbound account payments as transfers, whichever sign they carry', () => {
    seed({
      id: 'payid-credit',
      description: 'PayID Payment Received, Thank you',
      amountCents: 50_000,
    });
    seed({
      id: 'payid-debit',
      description: 'PayID Payment Received, Thank you',
      amountCents: -50_000,
    });

    raw.exec(migrationSql());

    expect(rowOf('payid-credit').type).toBe('transfer');
    expect(rowOf('payid-debit').type).toBe('transfer');
  });

  it('does not touch a row already typed by hand', () => {
    seed({ id: 'manual', description: 'PAYMENT RECEIVED', type: 'income' });

    raw.exec(migrationSql());

    expect(rowOf('manual').type).toBe('income');
  });
});

describe('0070_fee_and_transfer_types — vocabulary usage', () => {
  function seedVocabulary(tag: string, usageCount: number): void {
    raw
      .prepare(
        `INSERT INTO tag_vocabulary (tag, facet, kind, usage_count) VALUES (?, 'fee', 'closed', ?)`
      )
      .run(tag, usageCount);
  }

  function usageOf(tag: string): number {
    const row = raw.prepare('SELECT usage_count FROM tag_vocabulary WHERE tag = ?').get(tag) as {
      usage_count: number;
    };
    return row.usage_count;
  }

  it('recounts the fee: values the backfill just applied', () => {
    // 0069 counted these against a table where no row carried a `fee:` value yet.
    seedVocabulary('fee:interest', 0);
    seedVocabulary('fee:late', 0);
    seed({ id: 'i1', description: 'INTEREST CHARGES' });
    seed({ id: 'i2', description: 'INTEREST CHARGED ON PURCHASES' });
    seed({ id: 'l1', description: 'CHARGE FOR OVERDUE PAYMENT' });

    raw.exec(migrationSql());

    expect(usageOf('fee:interest')).toBe(2);
    expect(usageOf('fee:late')).toBe(1);
  });

  it('recomputes rather than increments, so a second run does not double it', () => {
    seedVocabulary('fee:interest', 0);
    seed({ id: 'i1', description: 'INTEREST CHARGES' });

    raw.exec(migrationSql());
    raw.exec(migrationSql());

    expect(usageOf('fee:interest')).toBe(1);
  });
});

describe('0070_fee_and_transfer_types — idempotency', () => {
  it('a second run changes nothing', () => {
    seed({ id: 'interest', description: 'INTEREST CHARGES', tags: ['contains:fee'] });
    seed({ id: 'gift', description: 'COLES GIFT CARD', tags: ['contains:gift-card'] });
    seed({ id: 'payid', description: 'PayID Payment Received, Thank you', amountCents: 50_000 });

    raw.exec(migrationSql());
    const afterFirst = ['interest', 'gift', 'payid'].map(rowOf);

    raw.exec(migrationSql());

    expect(['interest', 'gift', 'payid'].map(rowOf)).toEqual(afterFirst);
    expect(afterFirst[0]).toEqual({ type: 'fee', tags: ['contains:fee', 'fee:interest'] });
  });
});

describe('0070_fee_and_transfer_types — agreement with the classifier', () => {
  const descriptors = [
    ...FEE_PATTERNS.flatMap(({ patterns }) => patterns),
    ...INBOUND_TRANSFER_PATTERNS,
  ];

  it('covers every pattern the classifier knows', () => {
    for (const [index, descriptor] of descriptors.entries()) {
      seed({ id: `p${index}`, description: `${descriptor} 12345` });
    }

    raw.exec(migrationSql());

    for (const [index, descriptor] of descriptors.entries()) {
      const derived = classifyFromDescription(`${descriptor} 12345`);
      expect(derived, `classifier missed its own pattern: ${descriptor}`).not.toBeNull();
      const row = rowOf(`p${index}`);
      expect(row.type, `migration disagrees on: ${descriptor}`).toBe(derived?.type);
      expect(row.tags, `migration disagrees on the fee: value for: ${descriptor}`).toEqual(
        derived?.tag ? [derived.tag] : []
      );
    }
  });

  it('agrees that an ordinary merchant descriptor is neither', () => {
    const ordinary = ['WOOLWORTHS METRO', 'FEE STREET CAFE', 'ANNUAL LEAVE PAYOUT', 'ATM CBA'];
    for (const [index, descriptor] of ordinary.entries()) {
      seed({ id: `o${index}`, description: descriptor });
    }

    raw.exec(migrationSql());

    for (const [index, descriptor] of ordinary.entries()) {
      expect(classifyFromDescription(descriptor)).toBeNull();
      expect(rowOf(`o${index}`)).toEqual({ type: 'purchase', tags: [] });
    }
  });
});
