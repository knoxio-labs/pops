/**
 * The lexical leg against a real temp cerebrum.db with the migrated FTS5 index
 * and no embedding rows at all.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../../../db/index.js';
import { seedSearchableEngram } from '../../../__tests__/search-fixtures.js';
import { LexicalSearchService } from '../lexical-search.js';

import type { RetrievalFilters } from '../types.js';

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-lexical-search-test-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const KARBON = 'eng_20260101_0001_karbon';
const BUDGET = 'eng_20260102_0002_budget';
const RECENT = 'eng_20260301_0003_recent';
const NEARBY = 'eng_20260103_0004_nearby';
const SECRET = 'eng_20260104_0005_secret';

function seedCorpus(): void {
  seedSearchableEngram(cerebrumDb, {
    id: KARBON,
    title: 'Infrastructure decisions',
    body: 'We decided to move the Karbon cluster in March. The migration runs over a weekend.',
    type: 'decision',
    scopes: ['work.infra'],
    tags: ['infra', 'decision'],
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  seedSearchableEngram(cerebrumDb, {
    id: BUDGET,
    title: 'Budget review',
    body: 'The migration of the budget spreadsheet is what I did about the quarterly numbers.',
    scopes: ['work.finance'],
    tags: ['finance'],
    createdAt: '2026-01-02T00:00:00.000Z',
  });
  seedSearchableEngram(cerebrumDb, {
    id: RECENT,
    title: 'Sourdough notes',
    body: 'What I did about the starter: fed it and left it in the cupboard.',
    scopes: ['personal.cooking'],
    createdAt: '2026-03-01T00:00:00.000Z',
    modifiedAt: '2026-09-30T00:00:00.000Z',
  });
  seedSearchableEngram(cerebrumDb, {
    id: NEARBY,
    title: 'Coffee places',
    body: 'A café near the office, and not far from the station either.',
    scopes: ['personal.places'],
    createdAt: '2026-01-03T00:00:00.000Z',
  });
  seedSearchableEngram(cerebrumDb, {
    id: SECRET,
    title: 'Karbon credentials',
    body: 'Root access notes for the Karbon cluster.',
    scopes: ['work.secret.infra'],
    createdAt: '2026-01-04T00:00:00.000Z',
  });
}

function search(query: string, filters: RetrievalFilters = {}, limit?: number) {
  return new LexicalSearchService(cerebrumDb.db).search(query, filters, limit);
}

function ids(query: string, filters: RetrievalFilters = {}): string[] {
  return search(query, filters).map((r) => r.sourceId);
}

describe('FTS5 availability', () => {
  it('ships in the SQLite build the pillar runs on, and the migration created the index', () => {
    const compiled = cerebrumDb.raw
      .prepare(`SELECT sqlite_compileoption_used('ENABLE_FTS5')`)
      .pluck()
      .get();
    const definition = cerebrumDb.raw
      .prepare(`SELECT sql FROM sqlite_master WHERE name = 'engram_fts'`)
      .pluck()
      .get();

    expect(compiled).toBe(1);
    expect(definition).toContain('fts5');
    expect(definition).toContain('porter unicode61 remove_diacritics 2');
  });
});

describe('LexicalSearchService', () => {
  beforeEach(seedCorpus);

  it('ranks the engram containing the rare word first for a natural-language question', () => {
    const results = search('what did I decide about the karbon migration');

    expect(results[0]?.sourceId).toBe(KARBON);
    expect(results[0]?.matchType).toBe('lexical');
    expect(results.map((r) => r.sourceId)).toEqual([KARBON, BUDGET]);
  });

  it('does not return the newest engram when it shares only function words with the question', () => {
    expect(ids('what did I decide about the karbon migration')).not.toContain(RECENT);
  });

  it('finds an engram for a question that is mostly function words', () => {
    expect(ids('what is it that we did with the karbon')).toEqual([KARBON]);
  });

  it('searches a query made only of function words rather than returning nothing', () => {
    expect(ids('what did I')).toEqual(expect.arrayContaining([BUDGET, RECENT]));
  });

  it('returns nothing for a query with no searchable term or no matching word', () => {
    expect(ids('')).toEqual([]);
    expect(ids('"*:-()')).toEqual([]);
    expect(ids('zeppelin')).toEqual([]);
  });

  it('matches across inflections and folds accents', () => {
    expect(ids('migrating')).toEqual(expect.arrayContaining([KARBON, BUDGET]));
    expect(ids('decision')).toContain(KARBON);
    expect(ids('cafe')).toEqual([NEARBY]);
  });

  it.each([
    ['"karbon"'],
    ['karbon*'],
    ['-karbon'],
    ['^karbon'],
    ['(karbon)'],
    ['body:karbon'],
    ['title:karbon'],
    ['karbon AND zeppelin'],
    ['karbon OR'],
    ['karbon" OR "zeppelin'],
    ['{title body}: karbon'],
  ])('treats FTS5 syntax in %s as plain words', (query) => {
    expect(ids(query)).toEqual([KARBON]);
  });

  it('does not let `*` act as a prefix operator', () => {
    expect(ids('karb*')).toEqual([]);
  });

  it('does not let NOT exclude or NEAR constrain: both are words an engram can contain', () => {
    expect(ids('karbon NOT migration').toSorted()).toEqual([KARBON, BUDGET, NEARBY].toSorted());
    expect(ids('NEAR(karbon zeppelin, 2)').toSorted()).toEqual([KARBON, NEARBY].toSorted());
  });

  it('matches the words AND, OR, NOT and NEAR as words', () => {
    expect(ids('NEAR')).toEqual([NEARBY]);
    expect(ids('NOT')).toEqual([NEARBY]);
    expect(ids('AND OR').toSorted()).toEqual([RECENT, NEARBY].toSorted());
  });

  it('scores the best hit 1 and every other hit as a share of it, best first', () => {
    const scores = search('karbon migration').map((r) => r.score);

    expect(scores[0]).toBe(1);
    expect(scores).toHaveLength(2);
    expect(scores[1]).toBeGreaterThan(0);
    expect(scores[1]).toBeLessThan(1);
  });

  it('returns a snippet of the matched text and the engram metadata', () => {
    const [hit] = search('karbon');

    expect(hit?.contentPreview).toContain('Karbon cluster');
    expect(hit?.title).toBe('Infrastructure decisions');
    expect(hit?.metadata).toMatchObject({
      type: 'decision',
      scopes: ['work.infra'],
      tags: expect.arrayContaining(['infra', 'decision']),
    });
  });

  it('honours the limit', () => {
    expect(search('migration', {}, 1).map((r) => r.sourceId)).toHaveLength(1);
  });

  describe('filters', () => {
    it('leaves out secret-scoped engrams unless includeSecret is set', () => {
      expect(ids('karbon')).toEqual([KARBON]);
      expect(ids('karbon', { includeSecret: true })).toEqual(
        expect.arrayContaining([KARBON, SECRET])
      );
    });

    it('constrains by scope prefix', () => {
      expect(ids('migration', { scopes: ['work.finance'] })).toEqual([BUDGET]);
      expect(ids('migration', { scopes: ['work'] })).toEqual(
        expect.arrayContaining([KARBON, BUDGET])
      );
      expect(ids('migration', { scopes: ['personal'] })).toEqual([]);
    });

    it('constrains by type', () => {
      expect(ids('migration', { types: ['decision'] })).toEqual([KARBON]);
    });

    it('constrains by tag, requiring every tag', () => {
      expect(ids('migration', { tags: ['finance'] })).toEqual([BUDGET]);
      expect(ids('migration', { tags: ['infra', 'finance'] })).toEqual([]);
    });

    it('constrains by creation date', () => {
      expect(ids('migration', { dateRange: { from: '2026-01-02T00:00:00.000Z' } })).toEqual([
        BUDGET,
      ]);
      expect(ids('migration', { dateRange: { to: '2026-01-01T12:00:00.000Z' } })).toEqual([KARBON]);
    });

    it('leaves out orphaned engrams by default and constrains by status when asked', () => {
      cerebrumDb.raw
        .prepare(`UPDATE engram_index SET status = 'orphaned' WHERE id = ?`)
        .run(KARBON);

      expect(ids('karbon')).toEqual([]);
      expect(ids('karbon', { status: ['orphaned'] })).toEqual([KARBON]);
    });

    it('returns nothing when the source types exclude engrams', () => {
      expect(ids('karbon', { sourceTypes: ['transaction'] })).toEqual([]);
      expect(ids('karbon', { sourceTypes: ['engram'] })).toEqual([KARBON]);
    });
  });
});
