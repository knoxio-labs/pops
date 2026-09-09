/**
 * Migration test for 0105_occasion_home_corrections.
 *
 * Every statement is keyed on evidence already on the row, so the cases that
 * matter are the ones it must NOT touch: a non-pharmacy row keeps its
 * `occasion:home`, and a genuine homewares shop keeps `venue:homewares`. A
 * migration that corrected those too would be indistinguishable from one that
 * strips the value everywhere, which is not what POPS-3285 decided.
 *
 * `usage_count` is asserted because it ranks the categorizer prompt: a move
 * that left it stale would keep offering the corrected-away value first, which
 * is half of how `occasion:home` grew in the first place.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const PRE_MIGRATION_DDL = `
CREATE TABLE tag_vocabulary (
  tag text PRIMARY KEY NOT NULL,
  facet text,
  kind text NOT NULL DEFAULT 'open',
  source text DEFAULT 'seed' NOT NULL,
  is_active integer DEFAULT 1 NOT NULL,
  usage_count integer NOT NULL DEFAULT 0,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  description text
);
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  description text NOT NULL,
  tags text NOT NULL DEFAULT '[]'
);
CREATE TABLE transaction_tag_rules (
  id text PRIMARY KEY NOT NULL,
  description_pattern text NOT NULL,
  tags text NOT NULL DEFAULT '[]'
);
CREATE TABLE transaction_corrections (
  id text PRIMARY KEY NOT NULL,
  description_pattern text NOT NULL,
  tags text NOT NULL DEFAULT '[]'
);
`;

const MIGRATION = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'migrations',
    '0105_occasion_home_corrections.sql'
  ),
  'utf8'
);

let raw: Database.Database;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(PRE_MIGRATION_DDL);
  for (const [tag, count] of [
    ['occasion:home', 10],
    ['occasion:health', 1],
    ['venue:homewares', 5],
  ] as const) {
    raw
      .prepare('INSERT INTO tag_vocabulary (tag, facet, usage_count) VALUES (?, ?, ?)')
      .run(tag, tag.split(':')[0], count);
  }
});

afterEach(() => {
  raw.close();
});

function txn(id: string, description: string, tags: string[]): void {
  raw
    .prepare('INSERT INTO transactions (id, description, tags) VALUES (?, ?, ?)')
    .run(id, description, JSON.stringify(tags));
}

function tagsOf(id: string): string[] {
  const row = raw.prepare('SELECT tags FROM transactions WHERE id = ?').get(id) as { tags: string };
  return JSON.parse(row.tags) as string[];
}

function usageOf(tag: string): number | undefined {
  const row = raw.prepare('SELECT usage_count FROM tag_vocabulary WHERE tag = ?').get(tag) as
    | { usage_count: number }
    | undefined;
  return row?.usage_count;
}

describe('0105_occasion_home_corrections', () => {
  it('moves a pharmacy row from occasion:home to occasion:health, keeping its other tags', () => {
    txn('t1', 'PRICELINE PHARMACY CANT CANTERBURY', [
      'venue:pharmacy',
      'contains:health',
      'occasion:home',
    ]);

    raw.exec(MIGRATION);

    expect(tagsOf('t1').toSorted()).toEqual([
      'contains:health',
      'occasion:health',
      'venue:pharmacy',
    ]);
  });

  it('leaves occasion:home alone on a row that is not a pharmacy', () => {
    txn('t2', 'ORIGIN ENERGY', ['contains:utilities', 'occasion:home']);

    raw.exec(MIGRATION);

    expect(tagsOf('t2').toSorted()).toEqual(['contains:utilities', 'occasion:home']);
  });

  it('does not double-tag a pharmacy row that already carries occasion:health', () => {
    txn('t3', 'CHEMIST WAREHOUSE', ['venue:pharmacy', 'occasion:home', 'occasion:health']);

    raw.exec(MIGRATION);

    expect(tagsOf('t3')).toEqual(['venue:pharmacy', 'occasion:health']);
  });

  it('moves Bunnings to the new venue:hardware and leaves a real homewares shop alone', () => {
    txn('t4', 'BUNNINGS 370000', ['enrich:bunnings', 'venue:homewares', 'channel:in-person']);
    txn('t5', 'KITCHEN WAREHOUSE', ['venue:homewares', 'contains:household']);

    raw.exec(MIGRATION);

    expect(tagsOf('t4').toSorted()).toEqual([
      'channel:in-person',
      'enrich:bunnings',
      'venue:hardware',
    ]);
    expect(tagsOf('t5').toSorted()).toEqual(['contains:household', 'venue:homewares']);
  });

  it('adds venue:hardware to the vocabulary as a closed, described, seeded value', () => {
    raw.exec(MIGRATION);

    const row = raw
      .prepare(
        'SELECT facet, kind, source, is_active, description FROM tag_vocabulary WHERE tag = ?'
      )
      .get('venue:hardware');

    expect(row).toEqual({
      facet: 'venue',
      kind: 'closed',
      source: 'seed',
      is_active: 1,
      description: 'A hardware, tool or building-supplies store.',
    });
  });

  it('moves the usage count with the rows, so the prompt stops ranking the wrong value first', () => {
    txn('t1', 'PRICELINE PHARMACY', ['venue:pharmacy', 'occasion:home']);
    txn('t2', 'PRICELINE PHARMACY', ['venue:pharmacy', 'occasion:home']);
    txn('t4', 'BUNNINGS 370000', ['venue:homewares']);

    raw.exec(MIGRATION);

    expect(usageOf('occasion:home')).toBe(8);
    expect(usageOf('occasion:health')).toBe(3);
    expect(usageOf('venue:homewares')).toBe(4);
    expect(usageOf('venue:hardware')).toBe(1);
  });

  it('corrects the rules too, so the next import does not put the value straight back', () => {
    raw
      .prepare('INSERT INTO transaction_tag_rules (id, description_pattern, tags) VALUES (?, ?, ?)')
      .run('r1', 'PRICELINE PHARMACY', JSON.stringify(['occasion:home']));
    raw
      .prepare(
        'INSERT INTO transaction_corrections (id, description_pattern, tags) VALUES (?, ?, ?)'
      )
      .run('c1', 'PRICELINE PHARMACY', JSON.stringify(['occasion:home', 'venue:pharmacy']));

    raw.exec(MIGRATION);

    const rule = raw.prepare('SELECT tags FROM transaction_tag_rules WHERE id = ?').get('r1') as {
      tags: string;
    };
    const correction = raw
      .prepare('SELECT tags FROM transaction_corrections WHERE id = ?')
      .get('c1') as { tags: string };

    expect(JSON.parse(rule.tags)).toEqual(['occasion:health']);
    expect((JSON.parse(correction.tags) as string[]).toSorted()).toEqual([
      'occasion:health',
      'venue:pharmacy',
    ]);
  });

  it('corrects a Bunnings correction rule too, not only a tag rule', () => {
    raw
      .prepare('INSERT INTO transaction_tag_rules (id, description_pattern, tags) VALUES (?, ?, ?)')
      .run('r2', 'BUNNINGS', JSON.stringify(['venue:homewares', 'enrich:bunnings']));
    raw
      .prepare(
        'INSERT INTO transaction_corrections (id, description_pattern, tags) VALUES (?, ?, ?)'
      )
      .run('c2', 'BUNNINGS', JSON.stringify(['venue:homewares', 'enrich:bunnings']));

    raw.exec(MIGRATION);

    const rule = raw.prepare('SELECT tags FROM transaction_tag_rules WHERE id = ?').get('r2') as {
      tags: string;
    };
    const correction = raw
      .prepare('SELECT tags FROM transaction_corrections WHERE id = ?')
      .get('c2') as { tags: string };

    expect((JSON.parse(rule.tags) as string[]).toSorted()).toEqual([
      'enrich:bunnings',
      'venue:hardware',
    ]);
    expect((JSON.parse(correction.tags) as string[]).toSorted()).toEqual([
      'enrich:bunnings',
      'venue:hardware',
    ]);
  });

  it('leaves a non-Bunnings homewares correction rule alone', () => {
    raw
      .prepare(
        'INSERT INTO transaction_corrections (id, description_pattern, tags) VALUES (?, ?, ?)'
      )
      .run('c3', 'KITCHEN WAREHOUSE', JSON.stringify(['venue:homewares']));

    raw.exec(MIGRATION);

    const correction = raw
      .prepare('SELECT tags FROM transaction_corrections WHERE id = ?')
      .get('c3') as { tags: string };

    expect(JSON.parse(correction.tags)).toEqual(['venue:homewares']);
  });

  it('is a no-op on a second run', () => {
    txn('t1', 'PRICELINE PHARMACY', ['venue:pharmacy', 'occasion:home']);
    txn('t4', 'BUNNINGS 370000', ['venue:homewares']);
    raw.exec(MIGRATION);
    const after = { t1: tagsOf('t1'), t4: tagsOf('t4'), home: usageOf('occasion:home') };

    raw.exec(MIGRATION);

    expect(tagsOf('t1')).toEqual(after.t1);
    expect(tagsOf('t4')).toEqual(after.t4);
    expect(usageOf('occasion:home')).toBe(after.home);
    expect(usageOf('occasion:health')).toBe(2);
  });
});
