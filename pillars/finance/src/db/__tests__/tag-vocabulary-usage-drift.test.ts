/**
 * `findVocabularyUsageDrift` (POPS-3740): the standing check behind
 * `/health`'s `vocabulary.usageDrift`, over a real migrated schema so it sees
 * both `tag_vocabulary` and `transactions`.
 *
 * Every case seeds its own tags rather than asserting on the whole table,
 * because the migration journal seeds vocabulary rows with usage counts of
 * its own (0069, 0106, ...) — a test that asserted on the full result set
 * would only be checking today's migration seed data, not the drift logic.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  openFinanceDb,
  tagVocabulary,
  tagVocabularyService,
  transactions,
  type OpenedFinanceDb,
} from '../index.js';
import { seededAccountId } from './seeded-account.js';

let tmpDir: string;
let opened: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-vocabulary-usage-drift-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

/** Insert a `transactions` row directly, bypassing the accounting the service
 * layer does on `tags` writes, so the stored `usage_count` cannot self-correct
 * out from under the drift a test is trying to create. */
function insertRawTxn(tags: string[]): void {
  opened.db
    .insert(transactions)
    .values({
      description: 'test row',
      accountId: seededAccountId(opened.db, 'Amex'),
      amountCents: -1000,
      date: '2026-01-01',
      type: 'purchase',
      lastEditedTime: '2026-01-01T00:00:00.000Z',
      tags: JSON.stringify(tags),
    })
    .run();
}

function setUsageCount(tag: string, usageCount: number): void {
  opened.db.update(tagVocabulary).set({ usageCount }).where(eq(tagVocabulary.tag, tag)).run();
}

function setActive(tag: string, isActive: boolean): void {
  opened.db.update(tagVocabulary).set({ isActive }).where(eq(tagVocabulary.tag, tag)).run();
}

function driftFor(tag: string) {
  return tagVocabularyService.findVocabularyUsageDrift(opened.db).find((row) => row.tag === tag);
}

describe('findVocabularyUsageDrift', () => {
  it('reports [] on a freshly migrated database with no transactions', () => {
    expect(tagVocabularyService.findVocabularyUsageDrift(opened.db)).toEqual([]);
  });

  it('reports a fresh, never-written tag as consistent', () => {
    tagVocabularyService.upsertVocabularyTag(opened.db, 'drift:unused', 'user');

    expect(driftFor('drift:unused')).toBeUndefined();
  });

  it('reports both the stored and actual counts when they disagree', () => {
    tagVocabularyService.upsertVocabularyTag(opened.db, 'drift:seeded', 'user');
    insertRawTxn(['drift:seeded']);
    insertRawTxn(['drift:seeded']);
    // usage_count is still 0 from the upsert — never incremented.

    expect(driftFor('drift:seeded')).toEqual({ tag: 'drift:seeded', usageCount: 0, actual: 2 });
  });

  it('reports a stale nonzero count against zero actual transactions', () => {
    tagVocabularyService.upsertVocabularyTag(opened.db, 'drift:stale', 'user');
    setUsageCount('drift:stale', 2);

    expect(driftFor('drift:stale')).toEqual({ tag: 'drift:stale', usageCount: 2, actual: 0 });
  });

  it('counts a tag carried twice on one row once, matching applyVocabularyUsageDelta', () => {
    tagVocabularyService.upsertVocabularyTag(opened.db, 'drift:dup', 'user');
    setUsageCount('drift:dup', 1);
    insertRawTxn(['drift:dup', 'drift:dup']);

    expect(driftFor('drift:dup')).toBeUndefined();
  });

  it('does not report an inactive row even when its count has drifted', () => {
    tagVocabularyService.upsertVocabularyTag(opened.db, 'drift:inactive', 'user');
    insertRawTxn(['drift:inactive']);
    setActive('drift:inactive', false);

    expect(driftFor('drift:inactive')).toBeUndefined();
  });

  it('reports [] with no seeded mismatch beyond the migration-seeded rows', () => {
    tagVocabularyService.upsertVocabularyTag(opened.db, 'drift:consistent', 'user');
    insertRawTxn(['drift:consistent']);
    setUsageCount('drift:consistent', 1);

    expect(driftFor('drift:consistent')).toBeUndefined();
  });
});
