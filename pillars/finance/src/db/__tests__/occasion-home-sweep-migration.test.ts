/**
 * Migration test for 0107_occasion_home_sweep.
 *
 * The three buckets are the whole design, so the cases that matter are the
 * boundaries between them: a row that keeps the tag, a row that loses it, and
 * a row that matches neither signal and must be flagged rather than guessed
 * at. A sweep that only stripped would be indistinguishable from deleting the
 * value, which is not what POPS-3285 decided — `occasion:home` is correct on
 * spend on the dwelling.
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
  usage_count integer NOT NULL DEFAULT 0
);
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  description text NOT NULL,
  tags text NOT NULL DEFAULT '[]'
);
CREATE TABLE transaction_tag_rules (
  id text PRIMARY KEY NOT NULL,
  description_pattern text NOT NULL,
  tags text NOT NULL DEFAULT '[]',
  is_active integer NOT NULL DEFAULT 1
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
    '0107_occasion_home_sweep.sql'
  ),
  'utf8'
);

let raw: Database.Database;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(DDL);
  raw
    .prepare('INSERT INTO tag_vocabulary (tag, facet, usage_count) VALUES (?, ?, ?)')
    .run('occasion:home', 'occasion', 167);
});

afterEach(() => {
  raw.close();
});

function txn(id: string, tags: string[]): void {
  raw
    .prepare('INSERT INTO transactions (id, description, tags) VALUES (?, ?, ?)')
    .run(id, id.toUpperCase(), JSON.stringify(tags));
}

function tagsOf(id: string): string[] {
  const row = raw.prepare('SELECT tags FROM transactions WHERE id = ?').get(id) as { tags: string };
  return (JSON.parse(row.tags) as string[]).toSorted();
}

function homeUsage(): number {
  const row = raw
    .prepare("SELECT usage_count FROM tag_vocabulary WHERE tag = 'occasion:home'")
    .get() as {
    usage_count: number;
  };
  return row.usage_count;
}

describe('0107_occasion_home_sweep — rows that lose the tag', () => {
  it.each([
    ['a grocery run', ['contains:groceries', 'venue:supermarket']],
    ['a bottle shop', ['contains:alcohol', 'venue:bottle-shop']],
    ['a subscription', ['contains:subscription', 'channel:online']],
    ['clothing', ['contains:clothing']],
    ['a takeaway', ['contains:food', 'venue:takeaway']],
    ['games', ['contains:games', 'channel:online']],
  ])('strips it from %s', (_label, others) => {
    txn('t', [...others, 'occasion:home']);

    raw.exec(MIGRATION);

    expect(tagsOf('t')).toEqual(others.toSorted());
  });

  it('strips a grocery run that also contained household items', () => {
    txn('t', ['contains:groceries', 'contains:household', 'venue:supermarket', 'occasion:home']);

    raw.exec(MIGRATION);

    expect(tagsOf('t')).toEqual(['contains:groceries', 'contains:household', 'venue:supermarket']);
  });
});

describe('0107_occasion_home_sweep — rows that keep it', () => {
  it.each([
    ['rent', ['contains:rent']],
    ['utilities', ['contains:utilities']],
    ['a mortgage payment', ['contains:mortgage']],
    ['household consumables', ['contains:household']],
    ['a repair', ['contains:maintenance']],
    ['a homewares shop', ['venue:homewares']],
    ['a hardware run', ['venue:hardware']],
    ['a Bunnings row with nothing else', ['enrich:bunnings']],
    ['an IKEA row', ['enrich:ikea']],
  ])('keeps it on %s', (_label, others) => {
    txn('t', [...others, 'occasion:home']);

    raw.exec(MIGRATION);

    expect(tagsOf('t')).toEqual([...others, 'occasion:home'].toSorted());
  });

  it('leaves a row that never carried occasion:home alone', () => {
    txn('t', ['contains:groceries', 'venue:supermarket']);

    raw.exec(MIGRATION);

    expect(tagsOf('t')).toEqual(['contains:groceries', 'venue:supermarket']);
  });

  it('leaves another occasion alone', () => {
    txn('t', ['contains:groceries', 'venue:supermarket', 'occasion:travel']);

    raw.exec(MIGRATION);

    expect(tagsOf('t')).toEqual(['contains:groceries', 'occasion:travel', 'venue:supermarket']);
  });
});

describe('0107_occasion_home_sweep — rows it cannot decide', () => {
  it('flags a row matching neither signal and leaves the tag on it', () => {
    txn('t', ['contains:insurance', 'occasion:home']);

    raw.exec(MIGRATION);

    expect(tagsOf('t')).toEqual(['contains:insurance', 'flag:needs-review', 'occasion:home']);
  });

  it('flags a row whose only tag is occasion:home', () => {
    txn('t', ['occasion:home']);

    raw.exec(MIGRATION);

    expect(tagsOf('t')).toEqual(['flag:needs-review', 'occasion:home']);
  });

  it('does not flag a row it strips, which needs no decision', () => {
    txn('t', ['contains:groceries', 'occasion:home']);

    raw.exec(MIGRATION);

    expect(tagsOf('t')).toEqual(['contains:groceries']);
  });

  it('does not flag a row it keeps, which is already right', () => {
    txn('t', ['contains:rent', 'occasion:home']);

    raw.exec(MIGRATION);

    expect(tagsOf('t')).toEqual(['contains:rent', 'occasion:home']);
  });

  it('does not add a second flag to a row already carrying one', () => {
    txn('t', ['contains:insurance', 'occasion:home', 'flag:needs-review']);

    raw.exec(MIGRATION);

    expect(tagsOf('t')).toEqual(['contains:insurance', 'flag:needs-review', 'occasion:home']);
  });
});

describe('0107_occasion_home_sweep — rules and counters', () => {
  function rule(id: string, tags: string[]): void {
    raw
      .prepare('INSERT INTO transaction_tag_rules (id, description_pattern, tags) VALUES (?, ?, ?)')
      .run(id, id.toUpperCase(), JSON.stringify(tags));
  }

  function ruleTags(id: string): string[] {
    const row = raw.prepare('SELECT tags FROM transaction_tag_rules WHERE id = ?').get(id) as {
      tags: string;
    };
    return (JSON.parse(row.tags) as string[]).toSorted();
  }

  it('strips the value from a grocery rule so the next import does not re-tag', () => {
    rule('woolworths', ['occasion:home', 'venue:supermarket']);

    raw.exec(MIGRATION);

    expect(ruleTags('woolworths')).toEqual(['venue:supermarket']);
  });

  it('leaves a rule that asserts home for a dwelling reason alone', () => {
    rule('origin', ['occasion:home', 'contains:utilities']);

    raw.exec(MIGRATION);

    expect(ruleTags('origin')).toEqual(['contains:utilities', 'occasion:home']);
  });

  it('leaves a rule asserting only occasion:home untouched and active', () => {
    rule('payid', ['occasion:home']);

    raw.exec(MIGRATION);

    const row = raw
      .prepare('SELECT tags, is_active FROM transaction_tag_rules WHERE id = ?')
      .get('payid') as { tags: string; is_active: number };

    // Nothing here can judge it: it carries no consumption signal, so the strip
    // does not match. It keeps its tag and stays active rather than being
    // quietly emptied.
    expect(row).toEqual({ tags: '["occasion:home"]', is_active: 1 });
  });

  it('never empties a rule, because the tag that qualified it is one it keeps', () => {
    rule('woolies', ['occasion:home', 'venue:supermarket']);
    rule('netflix', ['occasion:home', 'contains:subscription']);
    rule('bws', ['occasion:home', 'contains:alcohol', 'venue:bottle-shop']);

    raw.exec(MIGRATION);

    const rows = raw.prepare('SELECT id, tags FROM transaction_tag_rules').all() as {
      id: string;
      tags: string;
    }[];

    for (const row of rows) {
      expect((JSON.parse(row.tags) as string[]).length, row.id).toBeGreaterThan(0);
    }
  });

  it('corrects a correction rule too', () => {
    raw
      .prepare(
        'INSERT INTO transaction_corrections (id, description_pattern, tags) VALUES (?, ?, ?)'
      )
      .run('c1', 'COLES', JSON.stringify(['occasion:home', 'contains:groceries']));

    raw.exec(MIGRATION);

    const row = raw.prepare('SELECT tags FROM transaction_corrections WHERE id = ?').get('c1') as {
      tags: string;
    };
    expect(JSON.parse(row.tags)).toEqual(['contains:groceries']);
  });

  it('decrements usage_count by exactly the rows stripped, not the rows matched', () => {
    txn('strip1', ['contains:groceries', 'occasion:home']);
    txn('strip2', ['contains:alcohol', 'occasion:home']);
    txn('keep', ['contains:rent', 'occasion:home']);
    txn('flag', ['contains:insurance', 'occasion:home']);

    raw.exec(MIGRATION);

    expect(homeUsage()).toBe(165);
  });

  it('is a no-op on a second run', () => {
    txn('strip', ['contains:groceries', 'occasion:home']);
    txn('keep', ['contains:rent', 'occasion:home']);
    txn('flag', ['contains:insurance', 'occasion:home']);
    raw.exec(MIGRATION);
    const after = {
      strip: tagsOf('strip'),
      keep: tagsOf('keep'),
      flag: tagsOf('flag'),
      usage: homeUsage(),
    };

    raw.exec(MIGRATION);

    expect({
      strip: tagsOf('strip'),
      keep: tagsOf('keep'),
      flag: tagsOf('flag'),
      usage: homeUsage(),
    }).toEqual(after);
  });
});
