/**
 * An import commit row carrying two values on a single-valued facet is refused
 * (POPS-3668). The refusal is per row, like every other row-level write
 * failure: the row lands in `failedDetails` naming the facet, nothing is
 * stored for it, and the rest of the batch still commits.
 */
import { describe, expect, it, vi } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { transactions } from '../../../../db/schema.js';
import { page, stubHandle } from '../../../contacts/__tests__/stub-handle.js';
import { createContactsClient } from '../../../contacts/client.js';
import { commitImport } from '../commit.js';

import type { CommitPayload } from '../types.js';

type CommitRow = CommitPayload['transactions'][number];

function noContacts() {
  return createContactsClient(() => stubHandle({ list: vi.fn(async () => page([], false)) }));
}

function row(checksum: string, tags: string[]): CommitRow {
  return {
    date: '2026-09-01',
    description: 'SQ *PALMS ON OXFORD',
    amount: -42,
    dialectAccountLabel: 'Amex',
    rawRow: JSON.stringify({ checksum }),
    checksum,
    transactionType: 'purchase',
    tags,
    entityId: undefined,
    entityName: undefined,
  };
}

async function commit(rows: CommitRow[]) {
  const { db } = freshMigratedFinanceDb();
  const result = await commitImport(db, noContacts(), {
    entities: [],
    changeSets: [],
    tagRuleChangeSets: [],
    transactions: rows,
  });
  return { result, stored: db.select().from(transactions).all() };
}

describe('import commit — single-valued facet cardinality', () => {
  it('refuses a row with two venues, naming the facet, and still commits the rest', async () => {
    const { result, stored } = await commit([
      row('two-venues', [
        'venue:takeaway',
        'occasion:out',
        'contains:food',
        'channel:in-person',
        'venue:restaurant',
      ]),
      row('one-venue', ['venue:restaurant', 'contains:food']),
    ]);

    expect(result.transactionsImported).toBe(1);
    expect(result.transactionsFailed).toBe(1);
    expect(result.failedDetails).toEqual([
      { checksum: 'two-venues', error: expect.stringContaining("'venue'") },
    ]);
    expect(stored.map((r) => r.checksum)).toEqual(['one-venue']);
  });

  it('accepts several values on a multi-valued facet', async () => {
    const { result, stored } = await commit([
      row('multi', ['venue:pub', 'contains:food', 'contains:alcohol']),
    ]);

    expect(result.failedDetails).toEqual([]);
    expect(stored).toHaveLength(1);
  });
});
