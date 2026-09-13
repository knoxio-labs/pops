/**
 * The outcome table as the real migration chain builds it (POPS-3677): an
 * outcome is readable per prompt version and only that version, and it dies
 * with its transaction rather than outliving it as an orphan the eval would
 * still count.
 */
import { describe, expect, it } from 'vitest';

import {
  listAiTagSuggestionOutcomes,
  recordAiTagSuggestionOutcome,
} from '../services/ai-tag-suggestion-outcomes.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

function insertTransaction(
  raw: ReturnType<typeof freshMigratedFinanceDb>['raw'],
  id: string
): void {
  raw
    .prepare(
      `INSERT INTO transactions (id, description, account_id, amount_cents, date, type, last_edited_time)
       VALUES (?, 'ZENGO PTY LTD', '00000000-0000-4000-8000-000000000004', -8032, '2026-04-27', 'purchase', '2026-04-27T00:00:00.000Z')`
    )
    .run(id);
}

describe('ai_tag_suggestion_outcomes', () => {
  it('reads back what was recorded, tags parsed, for the requested version only', () => {
    const { db, raw } = freshMigratedFinanceDb();
    insertTransaction(raw, 'txn-1');
    insertTransaction(raw, 'txn-2');

    recordAiTagSuggestionOutcome(db, {
      transactionId: 'txn-1',
      promptVersion: 'tags-v2.0',
      suggestedTags: ['venue:takeaway', 'contains:food'],
      committedTags: ['hobby:crypto'],
    });
    recordAiTagSuggestionOutcome(db, {
      transactionId: 'txn-2',
      promptVersion: 'tags-v3.0',
      suggestedTags: ['venue:supermarket'],
      committedTags: ['venue:supermarket'],
    });

    const outcomes = listAiTagSuggestionOutcomes(db, 'tags-v2.0');
    expect(outcomes).toEqual([
      expect.objectContaining({
        transactionId: 'txn-1',
        promptVersion: 'tags-v2.0',
        suggestedTags: ['venue:takeaway', 'contains:food'],
        committedTags: ['hobby:crypto'],
      }),
    ]);
  });

  it('is deleted with its transaction', () => {
    const { db, raw } = freshMigratedFinanceDb();
    raw.pragma('foreign_keys = ON');
    insertTransaction(raw, 'txn-1');
    recordAiTagSuggestionOutcome(db, {
      transactionId: 'txn-1',
      promptVersion: 'tags-v2.0',
      suggestedTags: ['venue:pub'],
      committedTags: [],
    });

    raw.prepare('DELETE FROM transactions WHERE id = ?').run('txn-1');

    expect(listAiTagSuggestionOutcomes(db, 'tags-v2.0')).toEqual([]);
  });

  it('refuses an outcome for a transaction that does not exist', () => {
    const { db, raw } = freshMigratedFinanceDb();
    raw.pragma('foreign_keys = ON');

    expect(() =>
      recordAiTagSuggestionOutcome(db, {
        transactionId: 'missing',
        promptVersion: 'tags-v2.0',
        suggestedTags: [],
        committedTags: [],
      })
    ).toThrow(/FOREIGN KEY/);
  });
});
