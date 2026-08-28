/**
 * Migration test for 0073_retire_contains_fee (POPS-2632).
 *
 * `contains:fee` restates what `type = 'fee'` and the `fee:` value already say,
 * so it is retired. The tables are pinned by hand rather than seeded through the
 * journal, for the same reason 0067's, 0069's and 0071's tests do it: seeding
 * through the journal would hand the migration its own output.
 *
 * The case that matters most is the row the classifier could not type. Its
 * `contains:fee` is the only evidence left of what it is, so the migration has
 * to leave it and say so rather than tidy it away.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** The columns 0073 touches, as they stand when it runs. */
const PRE_MIGRATION_DDL = `
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  description text NOT NULL,
  type text DEFAULT 'purchase' NOT NULL,
  tags text DEFAULT '[]' NOT NULL
);
CREATE TABLE transaction_tag_rules (
  id text PRIMARY KEY NOT NULL,
  description_pattern text NOT NULL,
  tags text DEFAULT '[]' NOT NULL,
  is_active integer DEFAULT 1 NOT NULL
);
CREATE TABLE transaction_corrections (
  id text PRIMARY KEY NOT NULL,
  description_pattern text NOT NULL,
  tags text DEFAULT '[]' NOT NULL
);
CREATE TABLE tag_vocabulary (
  tag text PRIMARY KEY NOT NULL,
  source text DEFAULT 'seed' NOT NULL,
  is_active integer DEFAULT 1 NOT NULL,
  usage_count integer DEFAULT 0 NOT NULL
);
`;

function migrationSql(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(
    join(here, '..', '..', '..', 'migrations', '0073_retire_contains_fee.sql'),
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

function seedTransaction(id: string, type: string, tags: readonly string[]): void {
  raw
    .prepare('INSERT INTO transactions (id, description, type, tags) VALUES (?, ?, ?, ?)')
    .run(id, `desc ${id}`, type, JSON.stringify(tags));
}

function seedTagRule(id: string, tags: readonly string[]): void {
  raw
    .prepare('INSERT INTO transaction_tag_rules (id, description_pattern, tags) VALUES (?, ?, ?)')
    .run(id, `pattern ${id}`, JSON.stringify(tags));
}

function seedCorrection(id: string, tags: readonly string[]): void {
  raw
    .prepare('INSERT INTO transaction_corrections (id, description_pattern, tags) VALUES (?, ?, ?)')
    .run(id, `pattern ${id}`, JSON.stringify(tags));
}

function seedVocabulary(tag: string, usageCount: number): void {
  raw.prepare('INSERT INTO tag_vocabulary (tag, usage_count) VALUES (?, ?)').run(tag, usageCount);
}

function migrate(): void {
  raw.transaction(() => raw.exec(MIGRATION))();
}

function tagsOf(table: string, id: string): string[] {
  const row = raw.prepare(`SELECT tags FROM ${table} WHERE id = ?`).get(id) as
    | { tags: string }
    | undefined;
  if (!row) throw new Error(`${table} ${id} vanished`);
  return JSON.parse(row.tags) as string[];
}

function ruleIsActive(id: string): number {
  const row = raw.prepare('SELECT is_active FROM transaction_tag_rules WHERE id = ?').get(id) as
    | { is_active: number }
    | undefined;
  if (!row) throw new Error(`rule ${id} vanished`);
  return row.is_active;
}

describe('0073 — the typed fee rows', () => {
  it('drops the redundant half and leaves the rest of the row in order', () => {
    seedTransaction('t1', 'fee', ['contains:fee', 'fee:interest', 'channel:online']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['fee:interest', 'channel:online']);
  });

  it('strips it from any row carrying a fee: value, whatever the type says', () => {
    seedTransaction('t1', 'purchase', ['contains:fee', 'fee:surcharge']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['fee:surcharge']);
  });

  it('leaves a row that never carried it completely alone', () => {
    seedTransaction('t1', 'fee', ['fee:atm']);
    seedTransaction('t2', 'purchase', ['venue:cafe', 'contains:coffee']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['fee:atm']);
    expect(tagsOf('transactions', 't2')).toEqual(['venue:cafe', 'contains:coffee']);
  });

  it('does not flag a row it stripped — nothing about it needs a human', () => {
    seedTransaction('t1', 'fee', ['contains:fee', 'fee:late']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['fee:late']);
  });
});

describe('0073 — the rows the classifier could not type', () => {
  it('keeps the tag and flags the row, because the descriptor is what is wrong', () => {
    seedTransaction('t1', 'purchase', ['contains:fee']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['contains:fee', 'flag:needs-review']);
  });

  it('flags a row typed fee that still carries no fee: value', () => {
    seedTransaction('t1', 'fee', ['contains:fee']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['contains:fee', 'flag:needs-review']);
  });

  it('does not add a second flag to a row already flagged', () => {
    seedTransaction('t1', 'purchase', ['flag:needs-review', 'contains:fee']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['flag:needs-review', 'contains:fee']);
  });
});

describe('0073 — rules and vocabulary left behind', () => {
  it('strips it from a tag rule unconditionally, since a rule reapplies it forever', () => {
    seedTagRule('r1', ['contains:fee', 'channel:online']);

    migrate();

    expect(tagsOf('transaction_tag_rules', 'r1')).toEqual(['channel:online']);
    expect(ruleIsActive('r1')).toBe(1);
  });

  it('deactivates a tag rule whose only assertion was the retired value', () => {
    seedTagRule('r1', ['contains:fee']);

    migrate();

    expect(tagsOf('transaction_tag_rules', 'r1')).toEqual([]);
    expect(ruleIsActive('r1')).toBe(0);
  });

  it('strips it from a correction rule too', () => {
    seedCorrection('c1', ['contains:fee', 'fee:interest']);

    migrate();

    expect(tagsOf('transaction_corrections', 'c1')).toEqual(['fee:interest']);
  });

  it('retires the vocabulary row without losing its provenance', () => {
    seedVocabulary('contains:fee', 41);
    seedVocabulary('contains:coffee', 104);

    migrate();

    expect(
      raw
        .prepare('SELECT is_active, usage_count, source FROM tag_vocabulary WHERE tag = ?')
        .get('contains:fee')
    ).toEqual({ is_active: 0, usage_count: 0, source: 'seed' });
    expect(
      raw
        .prepare('SELECT is_active, usage_count FROM tag_vocabulary WHERE tag = ?')
        .get('contains:coffee')
    ).toEqual({ is_active: 1, usage_count: 104 });
  });

  it('recounts the retired value against the rows it deliberately left carrying it', () => {
    seedVocabulary('contains:fee', 41);
    seedTransaction('t1', 'fee', ['contains:fee', 'fee:interest']);
    seedTransaction('t2', 'purchase', ['contains:fee']);
    seedTransaction('t3', 'purchase', ['contains:fee']);

    migrate();

    expect(
      raw.prepare('SELECT usage_count FROM tag_vocabulary WHERE tag = ?').get('contains:fee')
    ).toEqual({ usage_count: 2 });
  });
});

describe('0073 — idempotency', () => {
  it('is a no-op on a second run, flag and usage count included', () => {
    seedTransaction('t1', 'fee', ['contains:fee', 'fee:interest']);
    seedTransaction('t2', 'purchase', ['contains:fee']);
    seedTagRule('r1', ['contains:fee']);
    seedTagRule('r2', ['contains:fee', 'channel:online']);
    seedCorrection('c1', ['contains:fee', 'fee:late']);
    seedVocabulary('contains:fee', 41);

    migrate();
    const snapshot = () => ({
      t1: tagsOf('transactions', 't1'),
      t2: tagsOf('transactions', 't2'),
      r1: [tagsOf('transaction_tag_rules', 'r1'), ruleIsActive('r1')],
      r2: [tagsOf('transaction_tag_rules', 'r2'), ruleIsActive('r2')],
      c1: tagsOf('transaction_corrections', 'c1'),
      vocab: raw
        .prepare('SELECT is_active, usage_count FROM tag_vocabulary WHERE tag = ?')
        .get('contains:fee'),
    });
    const afterFirst = snapshot();

    migrate();

    expect(snapshot()).toEqual(afterFirst);
  });
});
