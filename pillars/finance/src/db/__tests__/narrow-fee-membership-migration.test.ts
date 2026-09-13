/**
 * Migration test for 0116_narrow_fee_membership (POPS-3699).
 *
 * `fee:membership` means a card or account membership fee on a `fee` row. A
 * purchase carrying it (a Prime subscription) must lose that one value and
 * nothing else; a genuine card `MEMBERSHIP FEE` must keep it. Rules lose it
 * too, and a rule it was the only tag of must stop applying.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const DDL = `
CREATE TABLE tag_vocabulary (
  tag text PRIMARY KEY NOT NULL,
  facet text,
  usage_count integer NOT NULL DEFAULT 0,
  description text
);
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  description text NOT NULL,
  type text NOT NULL,
  tags text NOT NULL DEFAULT '[]'
);
CREATE TABLE transaction_tag_rules (
  id text PRIMARY KEY NOT NULL,
  description_pattern text NOT NULL,
  tags text NOT NULL DEFAULT '[]',
  is_active integer NOT NULL DEFAULT 1
);
`;

const MIGRATION = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'migrations',
    '0116_narrow_fee_membership.sql'
  ),
  'utf8'
);

let raw: Database.Database;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(DDL);
  raw
    .prepare(
      "INSERT INTO tag_vocabulary (tag, facet, usage_count, description) VALUES ('fee:membership', 'fee', 99, 'A recurring membership or account-keeping fee.')"
    )
    .run();
});

afterEach(() => {
  raw.close();
});

function txn(id: string, description: string, type: string, tags: string[]): void {
  raw
    .prepare('INSERT INTO transactions (id, description, type, tags) VALUES (?, ?, ?, ?)')
    .run(id, description, type, JSON.stringify(tags));
}

function rule(id: string, pattern: string, tags: string[]): void {
  raw
    .prepare('INSERT INTO transaction_tag_rules (id, description_pattern, tags) VALUES (?, ?, ?)')
    .run(id, pattern, JSON.stringify(tags));
}

function tagsOf(id: string): string[] {
  const row = raw.prepare('SELECT tags FROM transactions WHERE id = ?').get(id) as {
    tags: string;
  };
  return JSON.parse(row.tags) as string[];
}

function ruleOf(id: string): { tags: string[]; isActive: number } {
  const row = raw
    .prepare('SELECT tags, is_active FROM transaction_tag_rules WHERE id = ?')
    .get(id) as { tags: string; is_active: number };
  return { tags: JSON.parse(row.tags) as string[], isActive: row.is_active };
}

function vocabRow(): { usageCount: number; description: string } {
  const row = raw
    .prepare("SELECT usage_count, description FROM tag_vocabulary WHERE tag = 'fee:membership'")
    .get() as { usage_count: number; description: string };
  return { usageCount: row.usage_count, description: row.description };
}

function snapshot(): unknown {
  return {
    transactions: raw.prepare('SELECT * FROM transactions ORDER BY id').all(),
    rules: raw.prepare('SELECT * FROM transaction_tag_rules ORDER BY id').all(),
    vocabulary: raw.prepare('SELECT * FROM tag_vocabulary ORDER BY tag').all(),
  };
}

describe('0116_narrow_fee_membership', () => {
  it('strips only fee:membership from a purchase, keeping the other tags in order', () => {
    txn('prime', 'AMZNPRIMEA* AMZNPRIMEA', 'purchase', [
      'contains:subscription',
      'fee:membership',
      'channel:online',
    ]);

    raw.exec(MIGRATION);

    expect(tagsOf('prime')).toEqual(['contains:subscription', 'channel:online']);
  });

  it('strips it from every non-fee type, not only purchases', () => {
    txn('xfer', 'SOMETHING', 'transfer', ['fee:membership']);

    raw.exec(MIGRATION);

    expect(tagsOf('xfer')).toEqual([]);
  });

  it('leaves a fee-typed card MEMBERSHIP FEE row untouched', () => {
    txn('amex', 'MEMBERSHIP FEE', 'fee', ['fee:membership', 'channel:online']);

    raw.exec(MIGRATION);

    expect(tagsOf('amex')).toEqual(['fee:membership', 'channel:online']);
  });

  it('leaves a purchase without fee:membership untouched', () => {
    txn('coffee', 'CAFE', 'purchase', ['venue:cafe', 'fee:surcharge']);

    raw.exec(MIGRATION);

    expect(tagsOf('coffee')).toEqual(['venue:cafe', 'fee:surcharge']);
  });

  it('removes fee:membership from a rule and keeps its other tags active', () => {
    rule('gym-rule', 'ANYTOWN GYM', ['venue:gym', 'fee:membership', 'occasion:health']);

    raw.exec(MIGRATION);

    expect(ruleOf('gym-rule')).toEqual({ tags: ['venue:gym', 'occasion:health'], isActive: 1 });
  });

  it('deactivates a rule whose only tag was fee:membership', () => {
    rule('prime-rule', 'AMZNPRIMEA', ['fee:membership']);

    raw.exec(MIGRATION);

    expect(ruleOf('prime-rule')).toEqual({ tags: [], isActive: 0 });
  });

  it('leaves a rule that never carried fee:membership alone', () => {
    rule('cafe-rule', 'CAFE', ['venue:cafe']);

    raw.exec(MIGRATION);

    expect(ruleOf('cafe-rule')).toEqual({ tags: ['venue:cafe'], isActive: 1 });
  });

  it('recounts usage_count from the rows left, counting a duplicated tag once', () => {
    txn('amex', 'MEMBERSHIP FEE', 'fee', ['fee:membership', 'fee:membership']);
    txn('annual', 'ANNUAL FEE', 'fee', ['fee:membership']);
    txn('prime', 'AMZNPRIMEA* AMZNPRIMEA', 'purchase', ['fee:membership']);

    raw.exec(MIGRATION);

    expect(vocabRow().usageCount).toBe(2);
  });

  it('describes the narrowed meaning so the categorizer stops offering it for subscriptions', () => {
    raw.exec(MIGRATION);

    expect(vocabRow().description).toBe(
      "A card or account membership fee, charged for holding the card or account itself, such as a card's annual fee. Not a subscription or a gym or club membership: those are purchases."
    );
  });

  it('stops the fee:account-keeping description glossing fee:membership as a subscription', () => {
    raw
      .prepare(
        "INSERT INTO tag_vocabulary (tag, facet, usage_count, description) VALUES ('fee:account-keeping', 'fee', 0, 'Not fee:membership, a card or subscription membership fee.')"
      )
      .run();

    raw.exec(MIGRATION);

    const row = raw
      .prepare("SELECT description FROM tag_vocabulary WHERE tag = 'fee:account-keeping'")
      .get() as { description: string };
    expect(row.description).not.toContain('subscription');
    expect(row.description).toContain('fee:membership');
  });

  it('is idempotent: a second run changes nothing', () => {
    txn('amex', 'MEMBERSHIP FEE', 'fee', ['fee:membership']);
    txn('prime', 'AMZNPRIMEA* AMZNPRIMEA', 'purchase', ['contains:subscription', 'fee:membership']);
    rule('gym-rule', 'ANYTOWN GYM', ['venue:gym', 'fee:membership']);
    rule('prime-rule', 'AMZNPRIMEA', ['fee:membership']);

    raw.exec(MIGRATION);
    const afterFirst = snapshot();
    raw.exec(MIGRATION);

    expect(snapshot()).toEqual(afterFirst);
  });
});
