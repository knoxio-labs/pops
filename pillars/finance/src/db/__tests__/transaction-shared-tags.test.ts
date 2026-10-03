import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { FeeTagOnNonFeeTypeError } from '../fee-tag-guard.js';
import { tagVocabulary, transactions } from '../schema.js';
import {
  attachSharedTag,
  detachSharedTag,
  listTransactionsBySharedTagIds,
} from '../services/transaction-shared-tags.js';
import { freshMigratedFinanceDb } from './migrated-db.js';
import { seededAccountId } from './seeded-account.js';

import type { FinanceDb } from '../services/internal.js';

let db: FinanceDb;
let accountId: string;

beforeEach(() => {
  db = freshMigratedFinanceDb().db;
  accountId = seededAccountId(db, 'Amex');
});

function insertSharedTag(tagId: string, tag: string, usageCount = 0): void {
  const facet = tag.slice(0, tag.indexOf(':'));
  db.insert(tagVocabulary)
    .values({ tag, facet, kind: 'open', source: 'user', sharedTagId: tagId, usageCount })
    .run();
}

function insertTransaction(
  id: string,
  date: string,
  tags: string[],
  type: 'purchase' | 'fee' = 'purchase'
): void {
  db.insert(transactions)
    .values({
      id,
      description: id,
      accountId,
      amountCents: -1200,
      date,
      type,
      tags: JSON.stringify(tags),
      lastEditedTime: `${date}T00:00:00.000Z`,
    })
    .run();
}

function storedTags(id: string): string[] {
  const row = db
    .select({ tags: transactions.tags })
    .from(transactions)
    .where(eq(transactions.id, id))
    .get();
  return JSON.parse(row?.tags ?? '[]') as string[];
}

function usageCount(tag: string): number | undefined {
  return db
    .select({ usageCount: tagVocabulary.usageCount })
    .from(tagVocabulary)
    .where(eq(tagVocabulary.tag, tag))
    .get()?.usageCount;
}

describe('listTransactionsBySharedTagIds', () => {
  it('matches parent and child ids without duplicating a transaction carrying both', () => {
    const parentTag = 'trip:shared-parent-test';
    const childTag = 'project:shared-child-test';
    insertSharedTag('shared-parent-test', parentTag);
    insertSharedTag('shared-child-test', childTag);
    insertTransaction('both', '2026-02-03', [parentTag, childTag, 'contains:coffee']);
    insertTransaction('parent', '2026-02-02', [parentTag]);
    insertTransaction('child', '2026-02-01', [childTag]);
    insertTransaction('unmatched', '2026-02-04', ['contains:tea']);

    const page = listTransactionsBySharedTagIds(
      db,
      ['shared-parent-test', 'shared-child-test', 'shared-parent-test', 'unknown-id'],
      10
    );

    expect(page.items.map(({ id, tagIds }) => ({ id, tagIds }))).toEqual([
      { id: 'both', tagIds: ['shared-parent-test', 'shared-child-test'] },
      { id: 'parent', tagIds: ['shared-parent-test'] },
      { id: 'child', tagIds: ['shared-child-test'] },
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('paginates across a date tie using the id tiebreaker', () => {
    const tag = 'trip:shared-pagination-test';
    insertSharedTag('shared-pagination-test', tag);
    for (const id of ['tie-c', 'tie-b', 'tie-a']) {
      insertTransaction(id, '2026-03-10', [tag]);
    }

    const first = listTransactionsBySharedTagIds(db, ['shared-pagination-test'], 2);
    const second = listTransactionsBySharedTagIds(
      db,
      ['shared-pagination-test'],
      2,
      first.nextCursor ?? undefined
    );

    expect(first.items.map(({ id }) => id)).toEqual(['tie-c', 'tie-b']);
    expect(first.nextCursor).toEqual({ beforeDate: '2026-03-10', beforeId: 'tie-b' });
    expect(second.items.map(({ id }) => id)).toEqual(['tie-a']);
    expect(second.nextCursor).toBeNull();
  });
});

describe('shared transaction tag mutations', () => {
  it('attaches idempotently, increments usage once, and preserves unrelated tags', () => {
    const tag = 'trip:shared-attach-test';
    insertSharedTag('shared-attach-test', tag, 6);
    insertSharedTag('unrelated-local-id', 'contains:keep-this', 5);
    insertTransaction('attach-target', '2026-04-10', ['contains:keep-this']);

    expect(attachSharedTag(db, 'attach-target', 'shared-attach-test')).toEqual({
      kind: 'updated',
      tagIds: ['shared-attach-test', 'unrelated-local-id'],
    });
    expect(attachSharedTag(db, 'attach-target', 'shared-attach-test')).toEqual({
      kind: 'unchanged',
      tagIds: ['shared-attach-test', 'unrelated-local-id'],
    });
    expect(storedTags('attach-target')).toEqual(['contains:keep-this', tag]);
    expect(usageCount(tag)).toBe(7);
    expect(usageCount('contains:keep-this')).toBe(5);
  });

  it('returns typed outcomes for a missing transaction and unknown shared tag', () => {
    insertTransaction('known-target', '2026-04-11', []);
    expect(attachSharedTag(db, 'missing-target', 'unknown-shared-tag')).toEqual({
      kind: 'transaction-not-found',
      transactionId: 'missing-target',
    });
    expect(attachSharedTag(db, 'known-target', 'unknown-shared-tag')).toEqual({
      kind: 'unknown-tag',
      tagId: 'unknown-shared-tag',
    });
  });

  it('detaching an absent shared tag is a no-op', () => {
    const tag = 'hobby:shared-absent-test';
    insertSharedTag('shared-absent-test', tag, 3);
    insertTransaction('detach-absent', '2026-04-12', ['contains:leave-this']);

    expect(detachSharedTag(db, 'detach-absent', 'shared-absent-test')).toEqual({
      kind: 'unchanged',
      tagIds: [],
    });
    expect(storedTags('detach-absent')).toEqual(['contains:leave-this']);
    expect(usageCount(tag)).toBe(3);
  });

  it('decrements usage once when detaching and preserves unrelated tags', () => {
    const tag = 'hobby:shared-detach-test';
    insertSharedTag('shared-detach-test', tag, 2);
    insertTransaction('detach-target', '2026-04-13', [tag, 'contains:keep-this']);

    expect(detachSharedTag(db, 'detach-target', 'shared-detach-test')).toEqual({
      kind: 'updated',
      tagIds: [],
    });
    expect(detachSharedTag(db, 'detach-target', 'shared-detach-test')).toEqual({
      kind: 'unchanged',
      tagIds: [],
    });
    expect(storedTags('detach-target')).toEqual(['contains:keep-this']);
    expect(usageCount(tag)).toBe(1);
  });

  it('keeps the fee-type guard on additive tag writes', () => {
    const tag = 'project:shared-fee-guard-test';
    insertSharedTag('shared-fee-guard-test', tag);
    insertTransaction('fee-guard-target', '2026-04-14', ['fee:atm'], 'purchase');

    expect(() => attachSharedTag(db, 'fee-guard-target', 'shared-fee-guard-test')).toThrow(
      FeeTagOnNonFeeTypeError
    );
    expect(storedTags('fee-guard-target')).toEqual(['fee:atm']);
    expect(usageCount(tag)).toBe(0);
  });
});
