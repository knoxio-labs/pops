/**
 * Invariant tests for the tag-vocabulary service against an in-memory
 * SQLite seeded with the canonical `tag_vocabulary` DDL — DB + service
 * layer only.
 *
 * The DDL is inlined rather than applied from
 * `migrations/0026_little_frank_castle.sql` because that file mixes the
 * `tag_vocabulary` CREATE with the `transaction_tag_rules` CREATE + seed
 * inserts; the test owns its own fixtures so it can exercise the service
 * contract in isolation.
 */
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { tagVocabulary } from '../schema.js';
import {
  createKnownTagSet,
  incrementVocabularyUsage,
  isKnownTag,
  listVocabularyTags,
  listVocabularyTagsForFacets,
  loadKnownTagSet,
  normalizeTagForComparison,
  upsertVocabularyTag,
} from '../services/tag-vocabulary.js';

import type { FinanceDb } from '../services/internal.js';

const TAG_VOCABULARY_DDL = `
CREATE TABLE tag_vocabulary (
  tag text PRIMARY KEY NOT NULL,
  facet text,
  kind text DEFAULT 'open' NOT NULL,
  source text DEFAULT 'seed' NOT NULL,
  is_active integer DEFAULT 1 NOT NULL,
  usage_count integer DEFAULT 0 NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL
);
CREATE INDEX idx_tag_vocabulary_active ON tag_vocabulary (is_active);
CREATE INDEX idx_tag_vocabulary_kind ON tag_vocabulary (kind, usage_count);
`;

interface TestHarness {
  db: FinanceDb;
  raw: Database.Database;
}

function freshDb(): TestHarness {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  raw.exec(TAG_VOCABULARY_DDL);
  return { db: drizzle(raw), raw };
}

describe('listVocabularyTags', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('returns an empty array when the vocabulary is empty', () => {
    expect(listVocabularyTags(harness.db)).toEqual([]);
  });

  it('returns every active tag in the table', () => {
    upsertVocabularyTag(harness.db, 'Groceries', 'seed');
    upsertVocabularyTag(harness.db, 'Coffee', 'seed');
    upsertVocabularyTag(harness.db, 'Rent', 'user');

    const tags = listVocabularyTags(harness.db);
    expect(tags).toHaveLength(3);
    expect(new Set(tags)).toEqual(new Set(['Groceries', 'Coffee', 'Rent']));
  });

  it('honours is_active=false rows by hiding them', () => {
    upsertVocabularyTag(harness.db, 'Active', 'seed');
    upsertVocabularyTag(harness.db, 'Retired', 'seed');

    harness.raw.prepare(`UPDATE tag_vocabulary SET is_active = 0 WHERE tag = ?`).run('Retired');

    expect(listVocabularyTags(harness.db)).toEqual(['Active']);
  });
});

describe('upsertVocabularyTag — insert path', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('creates a row with the supplied source and is_active=true', () => {
    upsertVocabularyTag(harness.db, 'Subscriptions', 'user');

    const rows = harness.db.select().from(tagVocabulary).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tag: 'Subscriptions',
      source: 'user',
      isActive: true,
    });
  });

  it('persists distinct rows for distinct tags', () => {
    upsertVocabularyTag(harness.db, 'Subscriptions', 'user');
    upsertVocabularyTag(harness.db, 'Donations', 'user');

    expect(new Set(listVocabularyTags(harness.db))).toEqual(
      new Set(['Subscriptions', 'Donations'])
    );
  });

  it('records the supplied source on first insert', () => {
    upsertVocabularyTag(harness.db, 'Seeded', 'seed');
    upsertVocabularyTag(harness.db, 'UserAdded', 'user');

    const seededRow = harness.db
      .select()
      .from(tagVocabulary)
      .where(eq(tagVocabulary.tag, 'Seeded'))
      .get();
    const userRow = harness.db
      .select()
      .from(tagVocabulary)
      .where(eq(tagVocabulary.tag, 'UserAdded'))
      .get();
    expect(seededRow?.source).toBe('seed');
    expect(userRow?.source).toBe('user');
  });
});

describe('upsertVocabularyTag — conflict path', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('is idempotent — repeated upsert of the same tag does not duplicate', () => {
    upsertVocabularyTag(harness.db, 'Coffee', 'seed');
    upsertVocabularyTag(harness.db, 'Coffee', 'seed');
    upsertVocabularyTag(harness.db, 'Coffee', 'user');

    const rows = harness.db.select().from(tagVocabulary).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tag).toBe('Coffee');
  });

  it('flips is_active back to true on conflict', () => {
    upsertVocabularyTag(harness.db, 'Coffee', 'seed');
    harness.raw.prepare(`UPDATE tag_vocabulary SET is_active = 0 WHERE tag = ?`).run('Coffee');
    expect(listVocabularyTags(harness.db)).toEqual([]);

    upsertVocabularyTag(harness.db, 'Coffee', 'user');
    expect(listVocabularyTags(harness.db)).toEqual(['Coffee']);
  });

  it('leaves source untouched on conflict — seed tag reactivated by a user keeps source=seed', () => {
    upsertVocabularyTag(harness.db, 'Coffee', 'seed');
    harness.raw.prepare(`UPDATE tag_vocabulary SET is_active = 0 WHERE tag = ?`).run('Coffee');
    upsertVocabularyTag(harness.db, 'Coffee', 'user');

    const row = harness.db
      .select()
      .from(tagVocabulary)
      .where(eq(tagVocabulary.tag, 'Coffee'))
      .get();
    expect(row?.source).toBe('seed');
    expect(row?.isActive).toBe(true);
  });

  it('preserves created_at on conflict', () => {
    upsertVocabularyTag(harness.db, 'Coffee', 'seed');
    const beforeRow = harness.db
      .select()
      .from(tagVocabulary)
      .where(eq(tagVocabulary.tag, 'Coffee'))
      .get();

    upsertVocabularyTag(harness.db, 'Coffee', 'user');
    const afterRow = harness.db
      .select()
      .from(tagVocabulary)
      .where(eq(tagVocabulary.tag, 'Coffee'))
      .get();

    expect(afterRow?.createdAt).toBe(beforeRow?.createdAt);
  });
});

// POPS-2606: `upsertVocabularyTag` derives facet/kind rather than taking them,
// and `incrementVocabularyUsage` maintains the counter the prompt ranks on.
describe('upsertVocabularyTag — derived facet and kind', () => {
  it('derives both from the tag string', () => {
    const { db, raw } = freshDb();
    try {
      upsertVocabularyTag(db, 'venue:bar', 'user');

      expect(
        raw.prepare('SELECT facet, kind FROM tag_vocabulary WHERE tag = ?').get('venue:bar')
      ).toEqual({ facet: 'venue', kind: 'closed' });
    } finally {
      raw.close();
    }
  });

  it('never classifies a user-minted unknown facet as closed', () => {
    const { db, raw } = freshDb();
    try {
      upsertVocabularyTag(db, 'vibe:cosy', 'user');
      upsertVocabularyTag(db, 'Groceries', 'user');

      const kinds = raw.prepare('SELECT tag, kind FROM tag_vocabulary ORDER BY tag').all();
      expect(kinds).toEqual([
        { tag: 'Groceries', kind: 'open' },
        { tag: 'vibe:cosy', kind: 'open' },
      ]);
    } finally {
      raw.close();
    }
  });

  it('corrects facet/kind on a row written before those columns carried a value', () => {
    const { db, raw } = freshDb();
    try {
      raw.prepare("INSERT INTO tag_vocabulary (tag, is_active) VALUES ('venue:bar', 0)").run();

      upsertVocabularyTag(db, 'venue:bar', 'user');

      expect(
        raw.prepare('SELECT facet, kind FROM tag_vocabulary WHERE tag = ?').get('venue:bar')
      ).toEqual({ facet: 'venue', kind: 'closed' });
    } finally {
      raw.close();
    }
  });
});

describe('incrementVocabularyUsage', () => {
  function countOf(raw: TestHarness['raw'], tag: string): number {
    return (
      raw.prepare('SELECT usage_count AS n FROM tag_vocabulary WHERE tag = ?').get(tag) as {
        n: number;
      }
    ).n;
  }

  it('bumps each named tag by one', () => {
    const { db, raw } = freshDb();
    try {
      upsertVocabularyTag(db, 'venue:bar', 'seed');
      upsertVocabularyTag(db, 'contains:food', 'seed');

      incrementVocabularyUsage(db, ['venue:bar', 'contains:food']);
      incrementVocabularyUsage(db, ['venue:bar']);

      expect(countOf(raw, 'venue:bar')).toBe(2);
      expect(countOf(raw, 'contains:food')).toBe(1);
    } finally {
      raw.close();
    }
  });

  it('counts a tag repeated within one transaction once', () => {
    const { db, raw } = freshDb();
    try {
      upsertVocabularyTag(db, 'venue:bar', 'seed');

      incrementVocabularyUsage(db, ['venue:bar', 'venue:bar']);

      expect(countOf(raw, 'venue:bar')).toBe(1);
    } finally {
      raw.close();
    }
  });

  it('does not mint a row for a tag absent from the vocabulary', () => {
    const { db, raw } = freshDb();
    try {
      incrementVocabularyUsage(db, ['venue:casino']);

      expect(raw.prepare('SELECT COUNT(*) AS n FROM tag_vocabulary').get()).toEqual({ n: 0 });
    } finally {
      raw.close();
    }
  });

  it('is a no-op for an empty list', () => {
    const { db, raw } = freshDb();
    try {
      upsertVocabularyTag(db, 'venue:bar', 'seed');

      incrementVocabularyUsage(db, []);

      expect(countOf(raw, 'venue:bar')).toBe(0);
    } finally {
      raw.close();
    }
  });
});

describe('listVocabularyTagsForFacets', () => {
  it('returns only the requested facets, most-used first', () => {
    const { db, raw } = freshDb();
    try {
      for (const tag of ['venue:bar', 'contains:food', 'trip:tokyo', 'enrich:amazon']) {
        upsertVocabularyTag(db, tag, 'seed');
      }
      raw.prepare("UPDATE tag_vocabulary SET usage_count = 200 WHERE tag = 'contains:food'").run();
      raw.prepare("UPDATE tag_vocabulary SET usage_count = 1 WHERE tag = 'venue:bar'").run();

      expect(listVocabularyTagsForFacets(db, ['venue', 'contains'])).toEqual([
        'contains:food',
        'venue:bar',
      ]);
      expect(listVocabularyTagsForFacets(db, ['trip'])).toEqual(['trip:tokyo']);
    } finally {
      raw.close();
    }
  });

  it('returns an open facet the categorizer classifies into, which a kind filter would have dropped', () => {
    const { db, raw } = freshDb();
    try {
      upsertVocabularyTag(db, 'contains:food', 'seed');

      expect(
        raw.prepare('SELECT kind FROM tag_vocabulary WHERE tag = ?').get('contains:food')
      ).toEqual({ kind: 'open' });
      expect(listVocabularyTagsForFacets(db, ['contains'])).toEqual(['contains:food']);
    } finally {
      raw.close();
    }
  });

  it('returns nothing for an empty facet list rather than the whole vocabulary', () => {
    const { db, raw } = freshDb();
    try {
      upsertVocabularyTag(db, 'venue:bar', 'seed');

      expect(listVocabularyTagsForFacets(db, [])).toEqual([]);
    } finally {
      raw.close();
    }
  });

  it('hides a deactivated tag', () => {
    const { db, raw } = freshDb();
    try {
      upsertVocabularyTag(db, 'venue:bar', 'seed');
      raw.prepare("UPDATE tag_vocabulary SET is_active = 0 WHERE tag = 'venue:bar'").run();

      expect(listVocabularyTagsForFacets(db, ['venue'])).toEqual([]);
    } finally {
      raw.close();
    }
  });
});

describe('createKnownTagSet — the one answer to "is this tag known" (POPS-2602)', () => {
  it('matches a tag that differs only in case', () => {
    const known = createKnownTagSet(['venue:Bar']);
    expect(known.has('venue:bar')).toBe(true);
    expect(known.has('VENUE:BAR')).toBe(true);
  });

  it('matches a tag that differs only in surrounding whitespace', () => {
    expect(createKnownTagSet(['  venue:bar  ']).has('venue:bar')).toBe(true);
    expect(createKnownTagSet(['venue:bar']).has(' venue:bar\n')).toBe(true);
  });

  it('never admits an empty or whitespace-only tag, from either side', () => {
    const known = createKnownTagSet(['', '   ', 'venue:bar']);
    expect(known.size).toBe(1);
    expect(known.has('')).toBe(false);
    expect(known.has('   ')).toBe(false);
  });

  it('keeps a value that itself contains the separator whole', () => {
    const known = createKnownTagSet(['project:kitchen:phase-2']);
    expect(known.has('project:kitchen:phase-2')).toBe(true);
    expect(known.has('project:kitchen')).toBe(false);
  });

  it('counts two spellings of one value once', () => {
    expect(createKnownTagSet(['venue:Bar', 'venue:bar']).size).toBe(1);
  });

  it('does not treat an unrelated tag as known', () => {
    expect(createKnownTagSet(['venue:bar']).has('venue:pub')).toBe(false);
  });
});

describe('normalizeTagForComparison', () => {
  it('trims and lower-cases', () => {
    expect(normalizeTagForComparison('  Venue:Bar ')).toBe('venue:bar');
  });
});

describe('loadKnownTagSet / isKnownTag', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('reads the active vocabulary and ignores a deactivated tag', () => {
    upsertVocabularyTag(harness.db, 'venue:bar', 'seed');
    upsertVocabularyTag(harness.db, 'venue:pub', 'seed');
    harness.raw.prepare("UPDATE tag_vocabulary SET is_active = 0 WHERE tag = 'venue:pub'").run();

    const known = loadKnownTagSet(harness.db);
    expect(known.has('venue:bar')).toBe(true);
    expect(known.has('venue:pub')).toBe(false);
    expect(isKnownTag(harness.db, 'VENUE:BAR')).toBe(true);
  });

  it('is empty for an empty vocabulary', () => {
    expect(loadKnownTagSet(harness.db).size).toBe(0);
  });
});
