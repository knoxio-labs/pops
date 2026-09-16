/**
 * An import commit row whose committed `type` is not `fee` stores none of the
 * `fee:` values it arrived with (POPS-2610): the row still commits, the other
 * tags are kept, and vocabulary usage counts only what was written.
 */
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { tagVocabulary, transactions } from '../../../../db/schema.js';
import { upsertVocabularyTag } from '../../../../db/services/tag-vocabulary.js';
import { page, stubHandle } from '../../../contacts/__tests__/stub-handle.js';
import { createContactsClient } from '../../../contacts/client.js';
import { commitImport } from '../commit.js';

import type { CommitPayload } from '../types.js';

type CommitRow = CommitPayload['transactions'][number];

function noContacts() {
  return createContactsClient(() => stubHandle({ list: vi.fn(async () => page([], false)) }));
}

function row(checksum: string, transactionType: CommitRow['transactionType'], tags: string[]) {
  return {
    date: '2026-09-01',
    description: 'PLUS FITNESS',
    amount: -18.95,
    dialectAccountLabel: 'Amex',
    rawRow: JSON.stringify({ checksum }),
    checksum,
    transactionType,
    tags,
    entityId: undefined,
    entityName: undefined,
  } satisfies CommitRow;
}

describe('import commit — fee tags on a non-fee row', () => {
  it('drops the fee value from a purchase, keeps the rest, and counts only what it wrote', async () => {
    const { db } = freshMigratedFinanceDb();
    upsertVocabularyTag(db, 'fee:membership', 'seed');
    const before = db
      .select({ usageCount: tagVocabulary.usageCount })
      .from(tagVocabulary)
      .where(eq(tagVocabulary.tag, 'fee:membership'))
      .get()?.usageCount;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await commitImport(db, noContacts(), {
      entities: [],
      changeSets: [],
      tagRuleChangeSets: [],
      transactions: [
        row('gym', 'purchase', ['venue:gym', 'FEE:membership', 'fee:membership']),
        row('annual', 'fee', ['fee:membership']),
      ],
    });

    expect(result.failedDetails).toEqual([]);
    expect(result.transactionsImported).toBe(2);
    const stored = new Map(
      db
        .select()
        .from(transactions)
        .all()
        .map((r) => [r.checksum, JSON.parse(r.tags)])
    );
    expect(stored.get('gym')).toEqual(['venue:gym']);
    expect(stored.get('annual')).toEqual(['fee:membership']);
    const after = db
      .select({ usageCount: tagVocabulary.usageCount })
      .from(tagVocabulary)
      .where(eq(tagVocabulary.tag, 'fee:membership'))
      .get()?.usageCount;
    expect(after).toBe((before ?? 0) + 1);
  });
});
