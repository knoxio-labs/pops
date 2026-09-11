/**
 * `applyTagRuleToExistingTransactions` maintains `tag_vocabulary.usage_count`
 * for the tags it actually merges onto a row (POPS-2627). It must not count a
 * tag `mergeTagsWithinFacetLimits` refused for a single-valued facet conflict
 * (`refusedFacetConflict`) — that tag was never written, so it never used
 * anything.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seededAccountId } from '../../../../db/__tests__/seeded-account.js';
import {
  openFinanceDb,
  tagVocabularyService,
  transactionTagRulesService,
  transactions,
  type FinanceDb,
  type OpenedFinanceDb,
} from '../../../../db/index.js';
import { tagVocabulary } from '../../../../db/schema.js';
import { applyTagRuleToExistingTransactions } from '../retroactive-apply.js';

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

function seedTxn(description: string, tags: string[]): string {
  const id = crypto.randomUUID();
  db.insert(transactions)
    .values({
      id,
      description,
      accountId: seededAccountId(db, 'amex'),
      amountCents: -1250,
      date: '2026-01-01',
      type: 'purchase',
      tags: JSON.stringify(tags),
      checksum: null,
      lastEditedTime: '2026-01-01T00:00:00.000Z',
    })
    .run();
  return id;
}

function seedRule(descriptionPattern: string, tags: string[]): string {
  return transactionTagRulesService.createTransactionTagRule(db, {
    descriptionPattern,
    matchType: 'exact',
    tags,
  }).id;
}

function usageCountOf(tag: string): number | undefined {
  return db
    .select({ usageCount: tagVocabulary.usageCount })
    .from(tagVocabulary)
    .where(eq(tagVocabulary.tag, tag))
    .get()?.usageCount;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-retroactive-apply-usage-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
  tagVocabularyService.upsertVocabularyTag(db, 'venue:cafe', 'seed');
  tagVocabularyService.upsertVocabularyTag(db, 'venue:pub', 'seed');
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('applyTagRuleToExistingTransactions — usage_count (POPS-2627)', () => {
  it('bumps the merged tag for every matched row', () => {
    seedTxn('COFFEE SHOP', []);
    seedTxn('COFFEE SHOP', []);
    const ruleId = seedRule('COFFEE SHOP', ['venue:cafe']);

    const result = applyTagRuleToExistingTransactions(db, ruleId);

    expect(result.updated).toBe(2);
    expect(usageCountOf('venue:cafe')).toBe(2);
  });

  it('does not bump a tag the row already carried', () => {
    seedTxn('COFFEE SHOP', ['venue:cafe']);
    const ruleId = seedRule('COFFEE SHOP', ['venue:cafe']);

    applyTagRuleToExistingTransactions(db, ruleId);

    expect(usageCountOf('venue:cafe')).toBe(0);
  });

  it('does not bump a tag refused for a single-valued facet conflict', () => {
    seedTxn('COFFEE SHOP', ['venue:pub']);
    const ruleId = seedRule('COFFEE SHOP', ['venue:cafe']);

    const result = applyTagRuleToExistingTransactions(db, ruleId);

    expect(result.refusedFacetConflict).toBe(1);
    expect(result.updated).toBe(0);
    expect(usageCountOf('venue:cafe')).toBe(0);
  });

  it('does not bump anything on a dry run', () => {
    seedTxn('COFFEE SHOP', []);
    const ruleId = seedRule('COFFEE SHOP', ['venue:cafe']);

    applyTagRuleToExistingTransactions(db, ruleId, { dryRun: true });

    expect(usageCountOf('venue:cafe')).toBe(0);
  });

  it('running the same rule twice is idempotent about usage as well as tags', () => {
    seedTxn('COFFEE SHOP', []);
    const ruleId = seedRule('COFFEE SHOP', ['venue:cafe']);

    applyTagRuleToExistingTransactions(db, ruleId);
    applyTagRuleToExistingTransactions(db, ruleId);

    expect(usageCountOf('venue:cafe')).toBe(1);
  });
});
