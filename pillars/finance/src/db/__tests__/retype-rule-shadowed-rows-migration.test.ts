/**
 * Migration test for 0080_retype_rule_shadowed_rows (POPS-2754).
 *
 * The rows a correction rule mistyped. 0070 and 0077 both left the ledger
 * agreeing with the classifier; the live import path then refilled the hole,
 * because a rule that named a merchant applied the merchant and dropped its own
 * `transactionType`, and the commit-time `?? 'purchase'` default supplied the
 * rest. `PAYMENT THANKYOU 008667` (+$4,545.37) and `PAYMENT THANKYOU 964110`
 * (+$3,000.00) landed on the expense tile, which negates a purchase, taking
 * $7,545 off June's reported spend.
 *
 * The tables are pinned by hand rather than seeded through the journal, for the
 * same reason 0071's, 0073's and 0077's tests do it: seeding through the
 * journal would hand the migration its own output.
 *
 * This migration matches on descriptors, so the controls matter more than the
 * targets: the rows below that must NOT move are what stop the sweep widening
 * into a re-typing of decisions somebody already made.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** The columns 0080 touches, as they stand when it runs. */
const PRE_MIGRATION_DDL = `
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  description text NOT NULL,
  amount_cents integer NOT NULL,
  type text DEFAULT 'purchase' NOT NULL,
  tags text DEFAULT '[]' NOT NULL
);
CREATE TABLE transaction_corrections (
  id text PRIMARY KEY NOT NULL,
  description_pattern text NOT NULL,
  transaction_type text
);
CREATE TABLE tag_vocabulary (
  tag text PRIMARY KEY NOT NULL,
  is_active integer DEFAULT 1 NOT NULL,
  usage_count integer DEFAULT 0 NOT NULL
);
`;

const APPLE_CREDIT = 'f0469c46-57e8-4e6d-a67c-96090f6beee6';
const RULE_MEMBERSHIP = '4dc906d6-9453-46cc-b699-6b0d63ad2b51';
const RULE_INTEREST = 'b54a8cf4-3c06-4a22-9742-a66f8149d5a8';

function migrationSql(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(
    join(here, '..', '..', '..', 'migrations', '0080_retype_rule_shadowed_rows.sql'),
    'utf8'
  );
}

const MIGRATION = migrationSql();

let raw: Database.Database;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(PRE_MIGRATION_DDL);
});

afterEach(() => {
  raw.close();
});

function seed(
  id: string,
  description: string,
  amountCents: number,
  type = 'purchase',
  tags: readonly string[] = []
): void {
  raw
    .prepare(
      'INSERT INTO transactions (id, description, amount_cents, type, tags) VALUES (?, ?, ?, ?, ?)'
    )
    .run(id, description, amountCents, type, JSON.stringify(tags));
}

function seedRule(id: string, pattern: string, transactionType: string | null): void {
  raw
    .prepare(
      'INSERT INTO transaction_corrections (id, description_pattern, transaction_type) VALUES (?, ?, ?)'
    )
    .run(id, pattern, transactionType);
}

function migrate(): void {
  raw.transaction(() => raw.exec(MIGRATION))();
}

function typeOf(id: string): string {
  return (raw.prepare('SELECT type FROM transactions WHERE id = ?').get(id) as { type: string })
    .type;
}

function tagsOf(id: string): string[] {
  const row = raw.prepare('SELECT tags FROM transactions WHERE id = ?').get(id) as { tags: string };
  return JSON.parse(row.tags) as string[];
}

function ruleTypeOf(id: string): string | null {
  const row = raw
    .prepare('SELECT transaction_type FROM transaction_corrections WHERE id = ?')
    .get(id) as { transaction_type: string | null };
  return row.transaction_type;
}

describe('0080 — the card payments', () => {
  it('types both ANZ card payments as transfers, whatever the amount', () => {
    seed('anz-a', 'PAYMENT THANKYOU 008667', 454_537);
    seed('anz-b', 'PAYMENT THANKYOU 964110', 300_000);

    migrate();

    expect(typeOf('anz-a')).toBe('transfer');
    expect(typeOf('anz-b')).toBe('transfer');
  });

  it('covers the spaced spelling and the joined one', () => {
    seed('spaced', 'PAYMENT THANK YOU 12345', 50_000);
    seed('joined', 'PAYMENT THANKYOU 12345', 50_000);

    migrate();

    expect(typeOf('spaced')).toBe('transfer');
    expect(typeOf('joined')).toBe('transfer');
  });

  it('leaves a decided credit alone — only a row still typed `purchase` is swept', () => {
    seed('decided', 'PAYMENT RECEIVED FROM EMPLOYER', 500_000, 'income');

    migrate();

    expect(typeOf('decided')).toBe('income');
  });
});

describe('0080 — the fees a rule shadowed', () => {
  it('types the ANZ interest charge as a fee', () => {
    seed('interest', 'INTEREST CHARGED ON PURCHASES', -25_649, 'purchase', ['fee:interest']);

    migrate();

    expect(typeOf('interest')).toBe('fee');
  });

  it('types the Amex membership fee as a fee', () => {
    seed('membership', 'MEMBERSHIP FEE', -45_000, 'purchase', ['fee:membership']);

    migrate();

    expect(typeOf('membership')).toBe('fee');
  });

  it('gives the most specific kind the row: a cash-advance fee is ATM, not interest', () => {
    seed('advance-fee', 'CASH ADVANCE FEE', -500);
    seed('advance-interest', 'CASH ADVANCE INTEREST', -900);

    migrate();

    expect(tagsOf('advance-fee')).toEqual(['fee:atm']);
    expect(tagsOf('advance-interest')).toEqual(['fee:interest']);
  });

  it('names the kind on a fee row that had no fee: value at all', () => {
    seed('untagged', 'CHARGE FOR OVERDUE PAYMENT', -3000);

    migrate();

    expect(typeOf('untagged')).toBe('fee');
    expect(tagsOf('untagged')).toEqual(['fee:late']);
  });

  it('keeps the one fee: value a row already carries, and its other tags', () => {
    seed('tagged', 'INTEREST CHARGES', -41_773, 'purchase', ['fee:interest', 'occasion:home']);

    migrate();

    expect(tagsOf('tagged')).toEqual(['fee:interest', 'occasion:home']);
  });

  it('leaves an ordinary merchant that merely reads like a fee alone', () => {
    seed('cafe', 'FEE STREET CAFE', -850);
    seed('atm-cba', 'ATM CBA MARRICKVILLE', -20_000);

    migrate();

    expect(typeOf('cafe')).toBe('purchase');
    expect(typeOf('atm-cba')).toBe('purchase');
    expect(tagsOf('cafe')).toEqual([]);
  });
});

describe('0080 — the Apple credit', () => {
  it('types the +$139.72 Apple credit as a refund', () => {
    seed(APPLE_CREDIT, 'APPLE.COM/BILL', 13_972, 'purchase', [
      'contains:subscription',
      'enrich:apple',
    ]);

    migrate();

    expect(typeOf(APPLE_CREDIT)).toBe('refund');
  });

  it('leaves every other APPLE.COM/BILL row a purchase — the descriptor is shared', () => {
    seed(APPLE_CREDIT, 'APPLE.COM/BILL', 13_972);
    seed('apple-charge', 'APPLE.COM/BILL', -18_499);

    migrate();

    expect(typeOf('apple-charge')).toBe('purchase');
  });
});

describe('0080 — the two rules that assert a fee is a purchase', () => {
  it('clears the type on both, so the classifier answers instead', () => {
    seedRule(RULE_MEMBERSHIP, 'MEMBERSHIP FEE', 'purchase');
    seedRule(RULE_INTEREST, 'INTEREST CHARGES', 'purchase');

    migrate();

    expect(ruleTypeOf(RULE_MEMBERSHIP)).toBeNull();
    expect(ruleTypeOf(RULE_INTEREST)).toBeNull();
  });

  it('leaves every other rule untouched, including one that legitimately says purchase', () => {
    seedRule('rule-ww', 'WW METRO', 'purchase');
    seedRule('rule-anz', 'PAYMENT THANKYOU', 'transfer');

    migrate();

    expect(ruleTypeOf('rule-ww')).toBe('purchase');
    expect(ruleTypeOf('rule-anz')).toBe('transfer');
  });
});

describe('0080 — vocabulary counts and idempotence', () => {
  it('recomputes fee: usage counts from the rows that now carry them', () => {
    raw.prepare('INSERT INTO tag_vocabulary (tag, usage_count) VALUES (?, ?)').run('fee:late', 0);
    seed('late-a', 'LATE PAYMENT FEE', -3000);
    seed('late-b', 'LATE PAYMENT FEE', -3000);

    migrate();

    const row = raw.prepare('SELECT usage_count FROM tag_vocabulary WHERE tag = ?').get('fee:late');
    expect(row).toEqual({ usage_count: 2 });
  });

  it('lands on the same state when run twice', () => {
    seed('anz', 'PAYMENT THANKYOU 008667', 454_537);
    seed('interest', 'INTEREST CHARGED ON PURCHASES', -25_649);
    seed(APPLE_CREDIT, 'APPLE.COM/BILL', 13_972);
    seedRule(RULE_MEMBERSHIP, 'MEMBERSHIP FEE', 'purchase');

    migrate();
    const after = raw.prepare('SELECT id, type, tags FROM transactions ORDER BY id').all();
    migrate();

    expect(raw.prepare('SELECT id, type, tags FROM transactions ORDER BY id').all()).toEqual(after);
    expect(ruleTypeOf(RULE_MEMBERSHIP)).toBeNull();
  });
});
