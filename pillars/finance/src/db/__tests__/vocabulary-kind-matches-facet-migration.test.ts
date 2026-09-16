/**
 * Migration test for 0119_vocabulary_kind_matches_facet (POPS-3744).
 *
 * Runs against a hand-built pre-migration table so drifted kinds can be
 * seeded; a fully migrated database already holds the right kinds and would
 * make every case vacuous.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TAG_FACETS, type TagFacetKind } from '../tag-facets.js';

const DDL = `
CREATE TABLE tag_vocabulary (
  tag text PRIMARY KEY NOT NULL,
  facet text,
  kind text NOT NULL DEFAULT 'open',
  usage_count integer NOT NULL DEFAULT 0
);
`;

const MIGRATION = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'migrations',
    '0119_vocabulary_kind_matches_facet.sql'
  ),
  'utf8'
);

let raw: Database.Database;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(DDL);
});

afterEach(() => {
  raw.close();
});

function seed(tag: string, facet: string | null, kind: TagFacetKind, usageCount = 0): void {
  raw
    .prepare('INSERT INTO tag_vocabulary (tag, facet, kind, usage_count) VALUES (?, ?, ?, ?)')
    .run(tag, facet, kind, usageCount);
}

function kindOf(tag: string): string | undefined {
  const row = raw.prepare('SELECT kind FROM tag_vocabulary WHERE tag = ?').get(tag) as
    | { kind: string }
    | undefined;
  return row?.kind;
}

function runMigration(): number {
  return raw.prepare(MIGRATION).run().changes;
}

function snapshot(): unknown {
  return raw.prepare('SELECT * FROM tag_vocabulary ORDER BY tag').all();
}

describe('0119_vocabulary_kind_matches_facet', () => {
  it('opens contains:streaming seeded closed, keeping its usage count', () => {
    seed('contains:streaming', 'contains', 'closed', 16);

    runMigration();

    expect(raw.prepare('SELECT * FROM tag_vocabulary').all()).toEqual([
      { tag: 'contains:streaming', facet: 'contains', kind: 'open', usage_count: 16 },
    ]);
  });

  it('closes a venue row seeded open', () => {
    seed('venue:pub', 'venue', 'open');

    runMigration();

    expect(kindOf('venue:pub')).toBe('closed');
  });

  it('makes a flag row a marker', () => {
    seed('flag:needs-review', 'flag', 'open');

    runMigration();

    expect(kindOf('flag:needs-review')).toBe('marker');
  });

  it('gives every facet in TAG_FACET_KINDS its kind as of 0119, so the CASE cannot miss one', () => {
    // 0119 is shipped history; 0120 opened venue and occasion, so this pins what they were when it ran.
    const kindAt0119 = TAG_FACETS.map(({ facet, kind }) => ({
      facet,
      kind: facet === 'venue' || facet === 'occasion' ? 'closed' : kind,
    }));
    for (const { facet, kind } of kindAt0119) {
      seed(`${facet}:drifted`, facet, kind === 'closed' ? 'marker' : 'closed');
    }

    runMigration();

    const mismatched = kindAt0119
      .filter(({ facet, kind }) => kindOf(`${facet}:drifted`) !== kind)
      .map(({ facet }) => facet);
    expect(mismatched).toEqual([]);
  });

  it('leaves a row that already has its facet kind untouched', () => {
    seed('contains:food', 'contains', 'open', 5);
    seed('venue:bar', 'venue', 'closed', 3);

    const before = snapshot();
    const changes = runMigration();

    expect(changes).toBe(0);
    expect(snapshot()).toEqual(before);
  });

  it('leaves an unfaceted legacy row alone, whatever its tag string says', () => {
    seed('contains:legacy', null, 'closed');
    seed('Groceries', null, 'closed');

    runMigration();

    expect(kindOf('contains:legacy')).toBe('closed');
    expect(kindOf('Groceries')).toBe('closed');
  });

  it('leaves a row on a facet the map does not recognise alone', () => {
    seed('vibe:cosy', 'vibe', 'closed');

    runMigration();

    expect(kindOf('vibe:cosy')).toBe('closed');
  });

  it('is idempotent: a second run writes no row', () => {
    seed('contains:streaming', 'contains', 'closed');
    seed('contains:haircut', 'contains', 'closed');
    seed('venue:pub', 'venue', 'open');
    seed('contains:food', 'contains', 'open');
    seed('Groceries', null, 'closed');

    expect(runMigration()).toBe(3);
    const afterFirst = snapshot();

    expect(runMigration()).toBe(0);
    expect(snapshot()).toEqual(afterFirst);
  });
});
