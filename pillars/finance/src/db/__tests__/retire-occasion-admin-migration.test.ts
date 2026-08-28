/**
 * Migration test for 0071_retire_occasion_admin (POPS-2607).
 *
 * `occasion:admin` restated what `type` says, so it is retired. The tables are
 * pinned by hand rather than seeded through the journal, for the same reason
 * 0067's and 0069's tests do it: seeding through the journal would hand the
 * migration its own output.
 *
 * The case that matters most is the one row where the tag and the column
 * disagreed — a spend row carrying `occasion:admin` is a mis-typed row, and the
 * migration has to surface it rather than quietly tidy it away.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** The columns 0071 touches, as they stand when it runs. */
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
    join(here, '..', '..', '..', 'migrations', '0071_retire_occasion_admin.sql'),
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

describe('0071 — stripping the retired value', () => {
  it('removes occasion:admin from a non-spend row and leaves its other tags in order', () => {
    seedTransaction('t1', 'transfer', ['contains:fee', 'occasion:admin', 'channel:online']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['contains:fee', 'channel:online']);
  });

  it('leaves a row that never carried it completely alone', () => {
    seedTransaction('t1', 'purchase', ['venue:cafe', 'occasion:out']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['venue:cafe', 'occasion:out']);
  });

  it('strips it from a tag rule while keeping what the rule really asserts', () => {
    seedTagRule('r1', ['contains:fee', 'occasion:admin']);

    migrate();

    expect(tagsOf('transaction_tag_rules', 'r1')).toEqual(['contains:fee']);
    expect(ruleIsActive('r1')).toBe(1);
  });

  it('strips it from a correction rule too', () => {
    seedCorrection('c1', ['occasion:admin', 'contains:fee']);

    migrate();

    expect(tagsOf('transaction_corrections', 'c1')).toEqual(['contains:fee']);
  });
});

describe('0071 — the rows where the tag and the column disagreed', () => {
  it('flags a spend row carrying it, because its type is the thing that is wrong', () => {
    seedTransaction('t1', 'purchase', ['occasion:admin']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['flag:needs-review']);
  });

  it('flags a refund and a reversal on the same reasoning', () => {
    seedTransaction('t1', 'refund', ['occasion:admin']);
    seedTransaction('t2', 'reversal', ['occasion:admin']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['flag:needs-review']);
    expect(tagsOf('transactions', 't2')).toEqual(['flag:needs-review']);
  });

  it('does not flag a non-spend row — that one was correctly tagged, just redundantly', () => {
    seedTransaction('t1', 'transfer', ['occasion:admin']);
    seedTransaction('t2', 'fee', ['occasion:admin']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual([]);
    expect(tagsOf('transactions', 't2')).toEqual([]);
  });

  it('does not add a second flag to a spend row already flagged', () => {
    seedTransaction('t1', 'purchase', ['flag:needs-review', 'occasion:admin']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['flag:needs-review']);
  });

  it('does not flag a spend row that never carried the retired value', () => {
    seedTransaction('t1', 'purchase', ['venue:cafe']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['venue:cafe']);
  });
});

describe('0071 — rules and vocabulary left behind', () => {
  it('deactivates a tag rule whose only assertion was the retired value', () => {
    seedTagRule('r1', ['occasion:admin']);

    migrate();

    expect(tagsOf('transaction_tag_rules', 'r1')).toEqual([]);
    expect(ruleIsActive('r1')).toBe(0);
  });

  it('deactivates a rule that was already empty — an empty rule can only waste a match', () => {
    seedTagRule('r1', []);

    migrate();

    expect(ruleIsActive('r1')).toBe(0);
  });

  it('retires the vocabulary row without losing its provenance or usage count', () => {
    seedVocabulary('occasion:admin', 18);
    seedVocabulary('occasion:out', 104);

    migrate();

    const admin = raw
      .prepare('SELECT is_active, usage_count, source FROM tag_vocabulary WHERE tag = ?')
      .get('occasion:admin');
    expect(admin).toEqual({ is_active: 0, usage_count: 18, source: 'seed' });
    const out = raw
      .prepare('SELECT is_active FROM tag_vocabulary WHERE tag = ?')
      .get('occasion:out');
    expect(out).toEqual({ is_active: 1 });
  });
});

describe('0071 — idempotency', () => {
  it('is a no-op on a second run, flag included', () => {
    seedTransaction('t1', 'purchase', ['occasion:admin']);
    seedTransaction('t2', 'transfer', ['contains:fee', 'occasion:admin']);
    seedTagRule('r1', ['occasion:admin']);
    seedTagRule('r2', ['contains:fee', 'occasion:admin']);
    seedVocabulary('occasion:admin', 18);

    migrate();
    const afterFirst = {
      t1: tagsOf('transactions', 't1'),
      t2: tagsOf('transactions', 't2'),
      r1: [tagsOf('transaction_tag_rules', 'r1'), ruleIsActive('r1')],
      r2: [tagsOf('transaction_tag_rules', 'r2'), ruleIsActive('r2')],
    };

    migrate();

    expect({
      t1: tagsOf('transactions', 't1'),
      t2: tagsOf('transactions', 't2'),
      r1: [tagsOf('transaction_tag_rules', 'r1'), ruleIsActive('r1')],
      r2: [tagsOf('transaction_tag_rules', 'r2'), ruleIsActive('r2')],
    }).toEqual(afterFirst);
  });
});
