/**
 * Migration test for 0067_tag_namespace (POPS-2611).
 *
 * The relabel it performs was first run as an ad-hoc script against the live
 * database, so the only thing that can prove the journal reproduces it is a
 * test that starts from the pre-migration shape. The tables are pinned by hand
 * here rather than derived from the journal for that reason — seeding through
 * `migrated-db.ts` would hand the migration its own output and prove nothing.
 *
 * Covered: the relabel itself (including the two-value expansions and the
 * dedup that makes `Eat Out` + `Food` one tag), the merchant overrides that
 * rescue a row whose tags were all rollups, the vocabulary rebuild, pass-through
 * of already-namespaced values, idempotency, and both hard failures — an
 * unmapped tag and an unrescued emptied row — including that a failure leaves
 * the database untouched.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** The shape the three tagged tables had before 0067 ran. */
const PRE_MIGRATION_DDL = `
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  description text NOT NULL,
  tags text DEFAULT '[]' NOT NULL
);
CREATE TABLE transaction_tag_rules (
  id text PRIMARY KEY NOT NULL,
  description_pattern text NOT NULL,
  tags text DEFAULT '[]' NOT NULL
);
CREATE TABLE tag_vocabulary (
  tag text PRIMARY KEY NOT NULL,
  source text DEFAULT 'seed' NOT NULL,
  is_active integer DEFAULT true NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL
);
`;

function migrationSql(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, '..', '..', '..', 'migrations', '0067_tag_namespace.sql'), 'utf8');
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

function seedTransaction(id: string, description: string, tags: readonly string[]): void {
  raw
    .prepare('INSERT INTO transactions (id, description, tags) VALUES (?, ?, ?)')
    .run(id, description, JSON.stringify(tags));
}

function seedRule(id: string, pattern: string, tags: readonly string[]): void {
  raw
    .prepare('INSERT INTO transaction_tag_rules (id, description_pattern, tags) VALUES (?, ?, ?)')
    .run(id, pattern, JSON.stringify(tags));
}

function seedVocabulary(...tags: readonly string[]): void {
  const insert = raw.prepare('INSERT INTO tag_vocabulary (tag) VALUES (?)');
  for (const tag of tags) insert.run(tag);
}

function tagsOf(id: string): string[] {
  const row = raw.prepare('SELECT tags FROM transactions WHERE id = ?').get(id) as { tags: string };
  return JSON.parse(row.tags) as string[];
}

function ruleTagsOf(id: string): string[] {
  const row = raw.prepare('SELECT tags FROM transaction_tag_rules WHERE id = ?').get(id) as {
    tags: string;
  };
  return JSON.parse(row.tags) as string[];
}

function activeVocabulary(): string[] {
  return (
    raw.prepare('SELECT tag FROM tag_vocabulary WHERE is_active = 1 ORDER BY tag').all() as {
      tag: string;
    }[]
  ).map((row) => row.tag);
}

/** Run the migration the way the migrator does — one transaction, all or nothing. */
function migrate(): void {
  raw.transaction(() => raw.exec(MIGRATION))();
}

describe('0067_tag_namespace', () => {
  it('relabels every flat tag onto its namespaced value', () => {
    seedTransaction('bar', 'THE OXFORD HOTEL', ['Go out', 'Bar', 'Alcohol']);
    seedTransaction('toll', 'LINKT SYDNEY', ['Toll', 'Tolls']);
    seedTransaction('shop', 'AMAZON MARKETPLACE', ['Amazon', 'Online']);

    migrate();

    expect(tagsOf('bar')).toEqual(['occasion:out', 'venue:bar', 'contains:alcohol']);
    // `Toll` and `Tolls` were separate values asserting the same thing.
    expect(tagsOf('toll')).toEqual(['contains:tolls']);
    expect(tagsOf('shop')).toEqual(['enrich:amazon', 'channel:online']);
  });

  it('expands the tags that assert two things and dedups the overlap', () => {
    seedTransaction('meal', 'THAI RESTAURANT', ['Eat Out', 'Food', 'Restaurant']);
    seedTransaction('charge', 'TESLA SUPERCHARGER', ['Charging', 'EV']);
    seedTransaction('lease', 'SG FLEET', ['Novated Lease']);

    migrate();

    // `Eat Out` is occasion:out + contains:food; the separate `Food` collapses
    // into the value already emitted rather than repeating it.
    expect(tagsOf('meal')).toEqual(['occasion:out', 'contains:food', 'venue:restaurant']);
    expect(tagsOf('charge')).toEqual(['contains:charging', 'asset:car']);
    expect(tagsOf('lease')).toEqual(['tax:novated-lease', 'asset:car']);
  });

  it('drops the rollups from a row that carries something else too', () => {
    seedTransaction('mixed', 'DAN MURPHYS', ['Shopping', 'Purchase', 'Alcohol']);

    migrate();

    expect(tagsOf('mixed')).toEqual(['contains:alcohol']);
  });

  it.each([
    ['nsw', 'TRANSPORTFORNSW OPAL', 'contains:public-transport'],
    ['spot', 'SPOTLIGHT PTY LTD', 'contains:household'],
    ['vho', 'VHO SYDNEY', 'contains:clothing'],
    ['houson', 'VAN HOUSEN 0421', 'contains:clothing'],
    ['ydpty', 'YD PTY LTD', 'contains:clothing'],
    ['yd', 'YD', 'contains:clothing'],
    ['pepper', 'PEPPER SEEDS', 'contains:clothing'],
    ['strike', 'STRIKE AUSTRALIA', 'venue:arcade'],
    ['archie', 'ARCHIE BROTHERS', 'venue:arcade'],
    ['gaym', 'GAYM SYDNEY', 'contains:fitness'],
    ['bway1', 'BROADWAYSHOPPINGCENT', 'flag:needs-review'],
    ['bway2', 'BROADWAY SHOPPING CTR', 'flag:needs-review'],
  ])('rescues %s, whose only tags were rollups, from the merchant', (id, description, expected) => {
    seedTransaction(id, description, ['Shopping', 'Entertainment']);

    migrate();

    expect(tagsOf(id)).toEqual([expected]);
  });

  it('matches an override case-insensitively, as the regexes it replaces did', () => {
    seedTransaction('lower', 'transportfornsw opal', ['Transport']);

    migrate();

    expect(tagsOf('lower')).toEqual(['contains:public-transport']);
  });

  it('applies the first matching override when a description matches two', () => {
    // `SPOTLIGHT` precedes the clothing rule, and both patterns match.
    seedTransaction('both', 'SPOTLIGHT VHO ', ['Shopping']);

    migrate();

    expect(tagsOf('both')).toEqual(['contains:household']);
  });

  it('does not consult an override for a row that mapped to something', () => {
    seedTransaction('keep', 'SPOTLIGHT PTY LTD', ['Shopping', 'Clothing']);

    migrate();

    expect(tagsOf('keep')).toEqual(['contains:clothing']);
  });

  it('leaves an already-empty row empty rather than rescuing it', () => {
    seedTransaction('none', 'SPOTLIGHT PTY LTD', []);

    migrate();

    expect(tagsOf('none')).toEqual([]);
  });

  it('relabels tag rules, matching overrides on the description pattern', () => {
    seedRule('r-bar', 'OXFORD%', ['Bar', 'Go out']);
    seedRule('r-spot', 'SPOTLIGHT%', ['Shopping']);

    migrate();

    expect(ruleTagsOf('r-bar')).toEqual(['venue:bar', 'occasion:out']);
    expect(ruleTagsOf('r-spot')).toEqual(['contains:household']);
  });

  it('rebuilds the vocabulary as the 83 namespaced values', () => {
    seedVocabulary('Bar', 'Groceries', 'Eurovision');

    migrate();

    const active = activeVocabulary();
    expect(active).toHaveLength(83);
    expect(active).toContain('venue:bar');
    expect(active).toContain('contains:groceries');
    // Values that exist only in the vocabulary are namespaced too.
    expect(active).toContain('tax:deductible');
    expect(active).toContain('fee:interest');
    // Every active value carries a namespace.
    for (const tag of active) expect(tag).toMatch(/^[a-z]+:[a-z0-9-]+$/);

    const deactivated = (
      raw.prepare('SELECT tag FROM tag_vocabulary WHERE is_active = 0 ORDER BY tag').all() as {
        tag: string;
      }[]
    ).map((row) => row.tag);
    expect(deactivated).toEqual(['Bar', 'Eurovision', 'Groceries']);
  });

  it('seeds the vocabulary into a database that has none', () => {
    migrate();

    expect(activeVocabulary()).toHaveLength(83);
  });

  it('preserves the source of a vocabulary value it reactivates', () => {
    raw.prepare("INSERT INTO tag_vocabulary (tag, source) VALUES ('venue:bar', 'user')").run();

    migrate();

    const row = raw
      .prepare("SELECT source, is_active FROM tag_vocabulary WHERE tag = 'venue:bar'")
      .get() as {
      source: string;
      is_active: number;
    };
    expect(row).toEqual({ source: 'user', is_active: 1 });
  });

  it('is idempotent — a second run changes nothing', () => {
    seedTransaction('bar', 'THE OXFORD HOTEL', ['Go out', 'Bar', 'Alcohol']);
    seedTransaction('nsw', 'TRANSPORTFORNSW OPAL', ['Transport']);
    seedRule('r-bar', 'OXFORD%', ['Bar']);
    seedVocabulary('Bar');

    migrate();
    const afterFirst = {
      transactions: raw.prepare('SELECT id, tags FROM transactions ORDER BY id').all(),
      rules: raw.prepare('SELECT id, tags FROM transaction_tag_rules ORDER BY id').all(),
      vocabulary: raw.prepare('SELECT tag, is_active FROM tag_vocabulary ORDER BY tag').all(),
    };

    migrate();

    expect({
      transactions: raw.prepare('SELECT id, tags FROM transactions ORDER BY id').all(),
      rules: raw.prepare('SELECT id, tags FROM transaction_tag_rules ORDER BY id').all(),
      vocabulary: raw.prepare('SELECT tag, is_active FROM tag_vocabulary ORDER BY tag').all(),
    }).toEqual(afterFirst);
    expect(afterFirst.transactions).toEqual([
      { id: 'bar', tags: '["occasion:out","venue:bar","contains:alcohol"]' },
      { id: 'nsw', tags: '["contains:public-transport"]' },
    ]);
  });

  it('aborts on a tag it has no mapping for', () => {
    seedTransaction('bar', 'THE OXFORD HOTEL', ['Bar']);
    seedTransaction('mystery', 'SOMETHING', ['weekly-shop']);

    expect(() => migrate()).toThrow(/tag_has_no_namespace_mapping/);
  });

  it('aborts on an unmapped tag carried only by a rule', () => {
    seedRule('r-mystery', 'ANYTHING%', ['weekly-shop']);

    expect(() => migrate()).toThrow(/tag_has_no_namespace_mapping/);
  });

  it('aborts rather than emptying a row whose only tags are rollups', () => {
    seedTransaction('lost', 'A MERCHANT NO OVERRIDE MATCHES', ['Shopping', 'Purchase']);

    expect(() => migrate()).toThrow(/row_would_lose_every_tag/);
  });

  it('aborts rather than emptying a rule whose only tags are rollups', () => {
    seedRule('r-lost', 'NO OVERRIDE%', ['Entertainment']);

    expect(() => migrate()).toThrow(/row_would_lose_every_tag/);
  });

  it('aborts on a tags column that is not a JSON array', () => {
    seedTransaction('ok', 'THE OXFORD HOTEL', ['Bar']);
    raw.prepare("UPDATE transactions SET tags = 'not json' WHERE id = 'ok'").run();

    expect(() => migrate()).toThrow(/tags_column_is_not_a_json_array/);
  });

  it('leaves the database untouched when it aborts', () => {
    seedTransaction('bar', 'THE OXFORD HOTEL', ['Bar']);
    seedTransaction('mystery', 'SOMETHING', ['weekly-shop']);
    seedVocabulary('Bar');

    expect(() => migrate()).toThrow();

    expect(tagsOf('bar')).toEqual(['Bar']);
    expect(activeVocabulary()).toEqual(['Bar']);
  });

  it('passes an already-namespaced value through untouched', () => {
    seedTransaction('done', 'THE OXFORD HOTEL', ['venue:bar', 'occasion:out']);
    // A namespaced value this migration never seeds is still not an unmapped tag.
    seedTransaction('later', 'A TRIP', ['trip:japan-2027']);

    migrate();

    expect(tagsOf('done')).toEqual(['venue:bar', 'occasion:out']);
    expect(tagsOf('later')).toEqual(['trip:japan-2027']);
  });
});
