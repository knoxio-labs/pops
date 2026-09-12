/**
 * Commit records what the model suggested beside what was committed
 * (POPS-3677), asserted against the stored rows. The outcome is the only way a
 * prompt revision's accept rate is observable, so a commit that drops it, or
 * records a rule's tags as the model's, fails here rather than in the numbers.
 */
import { describe, expect, it, vi } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { transactions } from '../../../../db/schema.js';
import { listAiTagSuggestionOutcomes } from '../../../../db/services/ai-tag-suggestion-outcomes.js';
import { page, stubHandle } from '../../../contacts/__tests__/stub-handle.js';
import { createContactsClient } from '../../../contacts/client.js';
import { commitImport } from '../commit.js';

import type { CommitPayload } from '../types.js';

type ConfirmedRow = CommitPayload['transactions'][number];

function noContacts() {
  return createContactsClient(() => stubHandle({ list: vi.fn(async () => page([], false)) }));
}

function row(overrides: Partial<ConfirmedRow>): ConfirmedRow {
  return {
    date: '2026-04-27',
    description: 'ZENGO PTY LTD',
    amount: -80.32,
    dialectAccountLabel: 'ANZ Credit Card',
    rawRow: '{}',
    checksum: `chk-${Math.random()}`,
    transactionType: 'purchase',
    ...overrides,
  };
}

async function commit(rows: ConfirmedRow[]) {
  const { db } = freshMigratedFinanceDb();
  const payload: CommitPayload = {
    entities: [],
    changeSets: [],
    tagRuleChangeSets: [],
    transactions: rows,
  };
  const result = await commitImport(db, noContacts(), payload);
  expect(result.failedDetails).toEqual([]);
  return db;
}

describe('commit — AI suggestion outcomes', () => {
  it('records the AI suggestion and the committed tags against the stored transaction', async () => {
    const db = await commit([
      row({
        tags: ['hobby:crypto'],
        suggestedTags: [
          { tag: 'venue:takeaway', source: 'ai', promptVersion: 'tags-v2.0' },
          { tag: 'contains:food', source: 'ai', promptVersion: 'tags-v2.0' },
        ],
      }),
    ]);

    const [stored] = db.select().from(transactions).all();
    expect(listAiTagSuggestionOutcomes(db, 'tags-v2.0')).toEqual([
      expect.objectContaining({
        transactionId: stored?.id,
        suggestedTags: ['venue:takeaway', 'contains:food'],
        committedTags: ['hobby:crypto'],
      }),
    ]);
  });

  it('leaves rule and entity suggestions out of the suggested side', async () => {
    const db = await commit([
      row({
        tags: ['venue:pub', 'contains:alcohol'],
        suggestedTags: [
          { tag: 'venue:pub', source: 'rule', pattern: 'ZENGO' },
          { tag: 'contains:alcohol', source: 'ai', promptVersion: 'tags-v2.0' },
          { tag: 'occasion:out', source: 'entity' },
        ],
      }),
    ]);

    expect(listAiTagSuggestionOutcomes(db, 'tags-v2.0')[0]?.suggestedTags).toEqual([
      'contains:alcohol',
    ]);
  });

  it('records nothing for a row with no AI suggestion', async () => {
    const db = await commit([
      row({
        tags: ['venue:pub'],
        suggestedTags: [{ tag: 'venue:pub', source: 'rule', pattern: 'X' }],
      }),
    ]);

    expect(listAiTagSuggestionOutcomes(db, 'tags-v2.0')).toEqual([]);
  });

  it('records nothing for an AI suggestion from a draft processed before versions were stamped', async () => {
    const db = await commit([
      row({ tags: [], suggestedTags: [{ tag: 'venue:pub', source: 'ai' }] }),
    ]);

    const count = db.select().from(transactions).all().length;
    expect(count).toBe(1);
    expect(listAiTagSuggestionOutcomes(db, 'tags-v2.0')).toEqual([]);
  });

  it('records an empty committed side when every suggestion was declined', async () => {
    const db = await commit([
      row({ suggestedTags: [{ tag: 'venue:takeaway', source: 'ai', promptVersion: 'tags-v2.0' }] }),
    ]);

    expect(listAiTagSuggestionOutcomes(db, 'tags-v2.0')[0]?.committedTags).toEqual([]);
  });
});
