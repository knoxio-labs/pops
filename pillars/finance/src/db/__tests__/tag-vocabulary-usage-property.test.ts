/**
 * Property-style check for `tag_vocabulary.usage_count` (POPS-2627): after a
 * long, deterministic sequence of writes across every path that touches
 * `transactions.tags` — direct create/update/delete/restore, a retroactive
 * tag-rule apply, and a retroactive correction-rule reclassify — the
 * maintained counter must equal the true count over `transactions.tags`.
 *
 * A fixed-seed PRNG stands in for a fuzzer: deterministic so a failure is
 * reproducible, but long enough (200 operations) to hit orderings a
 * hand-written example would not think to try, e.g. deleting a row a
 * retroactive pass has not yet reached, or restoring a row after the
 * vocabulary tags it once carried are exhausted elsewhere.
 *
 * `describeForMatching`/rule descriptions are dodged entirely — every
 * transaction shares the one description both retroactive passes match — so
 * the test is exercising accounting, not pattern-matching.
 */
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { reclassifyExistingTransactions } from '../../api/modules/imports/reclassify-existing.js';
import { applyTagRuleToExistingTransactions } from '../../api/modules/tag-rules/retroactive-apply.js';
import { transactionCorrections, transactionTagRulesService } from '../index.js';
import { tagVocabulary } from '../schema.js';
import { createAccount } from '../services/accounts.js';
import { upsertVocabularyTag } from '../services/tag-vocabulary.js';
import {
  createTransaction,
  deleteTransaction,
  restoreTransaction,
  updateTransaction,
} from '../services/transactions.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

import type Database from 'better-sqlite3';

import type { FinanceDb, TransactionRow } from '../services/internal.js';

const VOCAB_TAGS = ['red', 'green', 'blue', 'yellow'];
const DESCRIPTION = 'RECURRING STORE PURCHASE';

/** A tiny deterministic PRNG (mulberry32) so a failure reproduces exactly. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  const value = items[Math.floor(rng() * items.length)];
  if (value === undefined) throw new Error('pick from an empty array');
  return value;
}

function randomTagSubset(rng: () => number): string[] {
  return VOCAB_TAGS.filter(() => rng() < 0.5);
}

/** The true count over `transactions.tags` for one tag, via `json_each`. */
function trueCountOf(raw: Database.Database, tag: string): number {
  const row = raw
    .prepare('SELECT COUNT(*) AS n FROM transactions r, json_each(r.tags) je WHERE je.value = ?')
    .get(tag) as { n: number };
  return row.n;
}

function maintainedCountOf(db: FinanceDb, tag: string): number {
  return (
    db
      .select({ usageCount: tagVocabulary.usageCount })
      .from(tagVocabulary)
      .where(eq(tagVocabulary.tag, tag))
      .get()?.usageCount ?? 0
  );
}

function seedTagRule(db: FinanceDb): string {
  return transactionTagRulesService.createTransactionTagRule(db, {
    descriptionPattern: DESCRIPTION,
    matchType: 'exact',
    tags: [pick(mulberry32(1), VOCAB_TAGS)],
  }).id;
}

function seedCorrectionRule(db: FinanceDb, tag: string): void {
  db.insert(transactionCorrections)
    .values({
      descriptionPattern: DESCRIPTION,
      matchType: 'exact',
      entityId: null,
      entityName: null,
      location: null,
      tags: JSON.stringify([tag]),
      transactionType: null,
      isActive: true,
      confidence: 0.95,
      priority: 0,
    })
    .run();
}

interface Model {
  db: FinanceDb;
  accountId: string;
  /** Live transaction ids, mirroring what a real caller could still act on. */
  live: string[];
  /** The most recent delete snapshot, if any, so a restore has something to hand back. */
  lastDeleted: TransactionRow | undefined;
}

function doCreate(model: Model, rng: () => number): void {
  const row = createTransaction(model.db, {
    description: DESCRIPTION,
    accountId: model.accountId,
    amountCents: -1000,
    date: '2026-01-01',
    tags: randomTagSubset(rng),
  });
  model.live.push(row.id);
}

function doUpdate(model: Model, rng: () => number): void {
  if (model.live.length === 0) return;
  const id = pick(rng, model.live);
  updateTransaction(model.db, id, { tags: randomTagSubset(rng) });
}

function doDelete(model: Model, rng: () => number): void {
  if (model.live.length === 0) return;
  const id = pick(rng, model.live);
  model.lastDeleted = deleteTransaction(model.db, id);
  model.live = model.live.filter((existing) => existing !== id);
}

function doRestore(model: Model): void {
  if (!model.lastDeleted) return;
  restoreTransaction(model.db, model.lastDeleted);
  model.live.push(model.lastDeleted.id);
  model.lastDeleted = undefined;
}

const OPERATIONS: ((model: Model, rng: () => number) => void)[] = [
  doCreate,
  doCreate,
  doUpdate,
  doUpdate,
  doUpdate,
  doDelete,
  doRestore,
];

describe('tag_vocabulary.usage_count — property: always the true count (POPS-2627)', () => {
  it('matches COUNT over json_each(transactions.tags) after 200 mixed writes', () => {
    const { db, raw } = freshMigratedFinanceDb();
    const accountId = createAccount(db, { name: 'Test', kind: 'checking', currency: 'AUD' }).id;
    for (const tag of VOCAB_TAGS) upsertVocabularyTag(db, tag, 'seed');

    const tagRuleId = seedTagRule(db);
    seedCorrectionRule(db, pick(mulberry32(2), VOCAB_TAGS));

    const rng = mulberry32(42);
    const model: Model = { db, accountId, live: [], lastDeleted: undefined };

    for (let i = 0; i < 200; i++) {
      pick(rng, OPERATIONS)(model, rng);
      if (i % 20 === 0) {
        applyTagRuleToExistingTransactions(db, tagRuleId);
        reclassifyExistingTransactions(db, []);
      }
    }
    applyTagRuleToExistingTransactions(db, tagRuleId);
    reclassifyExistingTransactions(db, []);

    for (const tag of VOCAB_TAGS) {
      expect(maintainedCountOf(db, tag)).toBe(trueCountOf(raw, tag));
    }
  });
});

describe('refusedFacetConflict never counts as usage (POPS-2627)', () => {
  it('a tag-rule apply refused for a single-valued facet conflict does not bump the count', () => {
    const { db } = freshMigratedFinanceDb();
    const accountId = createAccount(db, { name: 'Test', kind: 'checking', currency: 'AUD' }).id;
    upsertVocabularyTag(db, 'venue:cafe', 'seed');
    upsertVocabularyTag(db, 'venue:pub', 'seed');
    createTransaction(db, {
      description: DESCRIPTION,
      accountId,
      amountCents: -1000,
      date: '2026-01-01',
      tags: ['venue:pub'],
    });
    const ruleId = transactionTagRulesService.createTransactionTagRule(db, {
      descriptionPattern: DESCRIPTION,
      matchType: 'exact',
      tags: ['venue:cafe'],
    }).id;

    const result = applyTagRuleToExistingTransactions(db, ruleId);

    expect(result.refusedFacetConflict).toBe(1);
    expect(maintainedCountOf(db, 'venue:cafe')).toBe(0);
  });
});
