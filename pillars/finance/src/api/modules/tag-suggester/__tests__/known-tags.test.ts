/**
 * Coverage for the two readers of "is this tag known" agreeing (POPS-2602).
 *
 * `isNew` used to be answered against `knownTags` — the *closed* vocabulary the
 * categorizer prompt was built from — so an open-namespace value the user had
 * already created came back flagged as new, while the tag-rule preview, reading
 * the whole active vocabulary, said it was not. Both now go through
 * `loadKnownTagSet`.
 *
 * The dedup casing case is the latent bug the same audit found: `seen` was
 * case-sensitive, so two spellings of one value landed on the row twice.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  openFinanceDb,
  tagVocabularyService,
  type FinanceDb,
  type OpenedFinanceDb,
} from '../../../../db/index.js';
import { loadKnownTags } from '../../imports/tag-management.js';
import { suggestTags } from '../index.js';

const MERCHANT = 'entity-merchant';

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-known-tags-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('suggestTags — isNew is answered against the whole vocabulary', () => {
  it('does not flag an open-namespace value already in the vocabulary as new', () => {
    tagVocabularyService.upsertVocabularyTag(db, 'trip:tokyo-2026', 'user');

    const suggested = suggestTags(db, {
      description: 'FLIGHTS',
      entityId: null,
      aiTags: ['trip:tokyo-2026'],
      knownTags: loadKnownTags(db),
    });

    expect(suggested).toEqual([{ tag: 'trip:tokyo-2026', source: 'ai' }]);
  });

  it('still flags a value the vocabulary has never held as new', () => {
    const suggested = suggestTags(db, {
      description: 'FLIGHTS',
      entityId: null,
      aiTags: ['trip:never-taken'],
      knownTags: loadKnownTags(db),
    });

    expect(suggested).toEqual([{ tag: 'trip:never-taken', source: 'ai', isNew: true }]);
  });

  it('ignores casing when deciding whether a value is new', () => {
    tagVocabularyService.upsertVocabularyTag(db, 'venue:bar', 'seed');

    const suggested = suggestTags(db, {
      description: 'THE LOCAL',
      entityId: null,
      aiTags: ['venue:Bar'],
      knownTags: loadKnownTags(db),
    });

    expect(suggested).toEqual([{ tag: 'venue:Bar', source: 'ai' }]);
  });

  it('flags a deactivated value as new again', () => {
    tagVocabularyService.upsertVocabularyTag(db, 'trip:tokyo-2026', 'user');
    opened.raw
      .prepare("UPDATE tag_vocabulary SET is_active = 0 WHERE tag = 'trip:tokyo-2026'")
      .run();

    const suggested = suggestTags(db, {
      description: 'FLIGHTS',
      entityId: null,
      aiTags: ['trip:tokyo-2026'],
      knownTags: loadKnownTags(db),
    });

    expect(suggested).toEqual([{ tag: 'trip:tokyo-2026', source: 'ai', isNew: true }]);
  });
});

describe('suggestTags — dedup is case-insensitive', () => {
  it('keeps the earlier pass when a later one repeats the value in another case', () => {
    const suggested = suggestTags(db, {
      description: 'THE LOCAL',
      entityId: MERCHANT,
      aiTags: ['venue:Bar'],
      knownTags: loadKnownTags(db),
      entityDefaultTags: new Map([[MERCHANT, ['venue:bar']]]),
    });

    expect(suggested).toEqual([{ tag: 'venue:Bar', source: 'ai' }]);
  });

  it('collapses two spellings within a single pass', () => {
    const suggested = suggestTags(db, {
      description: 'THE LOCAL',
      entityId: null,
      correctionTags: ['venue:bar', 'VENUE:BAR'],
      correctionPattern: 'THE LOCAL',
    });

    expect(suggested).toEqual([{ tag: 'venue:bar', source: 'rule', pattern: 'THE LOCAL' }]);
  });
});
