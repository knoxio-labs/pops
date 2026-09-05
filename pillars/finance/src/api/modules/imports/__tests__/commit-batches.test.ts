/**
 * Import-batch recording at commit (POPS-2916, ADR-052): one batch per
 * account that received a row, stamped onto those rows, linked to the
 * checkpoint the same commit minted, recorded verbatim from the payload's
 * `source` or inferred when a client sent none, and written inside the
 * caller's transaction so a later failure takes it down too.
 */
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { importBatches, transactions } from '../../../../db/schema.js';
import { createAccount } from '../../../../db/services/accounts.js';
import { page, stubHandle } from '../../../contacts/__tests__/stub-handle.js';
import { createContactsClient } from '../../../contacts/client.js';
import { recordImportBatchesPhase } from '../commit-batches.js';
import { commitImport } from '../commit.js';

import type { FinanceDb } from '../../../../db/services/internal.js';
import type { CommitPayload, ConfirmedTransaction } from '../types.js';

function noContacts() {
  return createContactsClient(() => stubHandle({ list: vi.fn(async () => page([], false)) }));
}

function seedAccount(db: FinanceDb, name: string, kind: 'credit-card' | 'checking'): string {
  return createAccount(db, { name, kind, currency: 'AUD' }).id;
}

function row(
  accountId: string,
  date: string,
  checksum: string,
  extra: Partial<ConfirmedTransaction> = {}
): ConfirmedTransaction {
  return {
    date,
    description: `Row ${checksum}`,
    amount: -10,
    account: 'Any',
    accountId,
    rawRow: '{}',
    checksum,
    transactionType: 'purchase',
    ...extra,
  };
}

function payload(
  transactions: ConfirmedTransaction[],
  extra: Partial<CommitPayload> = {}
): CommitPayload {
  return { entities: [], changeSets: [], tagRuleChangeSets: [], transactions, ...extra };
}

describe('recordImportBatchesPhase, via commitImport', () => {
  it('writes one batch per account with the row count and inclusive span, stamped on every row', async () => {
    const { db } = freshMigratedFinanceDb();
    const card = seedAccount(db, 'Card', 'credit-card');
    const checking = seedAccount(db, 'Checking', 'checking');

    const result = await commitImport(
      db,
      noContacts(),
      payload(
        [
          row(card, '2026-07-10', 'c1'),
          row(card, '2026-07-02', 'c2'),
          row(checking, '2026-07-05', 'k1'),
        ],
        {
          commitKey: 'a2b3c4d5-0000-4000-8000-000000000001',
          source: { kind: 'csv-dialect', dialectId: 'ANZ Credit Card' },
        }
      )
    );

    expect(result.transactionsImported).toBe(3);
    const batches = db.select().from(importBatches).all();
    expect(batches).toHaveLength(2);

    const cardBatch = batches.find((b) => b.accountId === card);
    expect(cardBatch).toMatchObject({
      sourceKind: 'csv-dialect',
      sourceRef: 'ANZ Credit Card',
      commitKey: 'a2b3c4d5-0000-4000-8000-000000000001',
      rowCount: 2,
      dateFrom: '2026-07-02',
      dateTo: '2026-07-10',
      checkpointId: null,
    });
    expect(batches.find((b) => b.accountId === checking)).toMatchObject({
      rowCount: 1,
      dateFrom: '2026-07-05',
      dateTo: '2026-07-05',
    });

    const stamped = db.select().from(transactions).where(eq(transactions.accountId, card)).all();
    expect(stamped.map((t) => t.importBatchId)).toEqual([cardBatch?.id, cardBatch?.id]);

    expect(result.batches).toHaveLength(2);
    expect(result.batches?.find((b) => b.accountId === card)).toEqual({
      id: cardBatch?.id,
      accountId: card,
      sourceKind: 'csv-dialect',
      rowCount: 2,
      dateFrom: '2026-07-02',
      dateTo: '2026-07-10',
      checkpointId: null,
    });
  });

  it('links the batch to the checkpoint the same commit minted for that account', async () => {
    const { db } = freshMigratedFinanceDb();
    const card = seedAccount(db, 'Card', 'credit-card');

    const result = await commitImport(
      db,
      noContacts(),
      payload([row(card, '2026-07-10', 'c1', { balanceCents: 65_000 })], {
        source: { kind: 'pdf-statement', parserId: 'anz-pdf-statement', parserVersion: '1' },
      })
    );

    const batch = db.select().from(importBatches).get();
    expect(batch).toMatchObject({
      sourceKind: 'pdf-statement',
      sourceRef: 'anz-pdf-statement',
      parserVersion: '1',
      checkpointId: result.checkpoints?.[0]?.id,
    });
    expect(batch?.checkpointId).toEqual(expect.any(String));
  });

  it('infers pdf-statement from a balance-carrying row and csv-dialect otherwise when the client sent no source', async () => {
    const { db } = freshMigratedFinanceDb();
    const card = seedAccount(db, 'Card', 'credit-card');
    const checking = seedAccount(db, 'Checking', 'checking');

    await commitImport(
      db,
      noContacts(),
      payload([row(card, '2026-07-10', 'c1', { balanceCents: 1 })])
    );
    await commitImport(db, noContacts(), payload([row(checking, '2026-07-10', 'k1')]));

    const kinds = db
      .select({
        accountId: importBatches.accountId,
        kind: importBatches.sourceKind,
        ref: importBatches.sourceRef,
      })
      .from(importBatches)
      .all();
    expect(kinds).toEqual(
      expect.arrayContaining([
        { accountId: card, kind: 'pdf-statement', ref: null },
        { accountId: checking, kind: 'csv-dialect', ref: null },
      ])
    );
  });

  it('infers the kind per account, so a statement row does not relabel the other account in the same commit', async () => {
    const { db } = freshMigratedFinanceDb();
    const card = seedAccount(db, 'Card', 'credit-card');
    const checking = seedAccount(db, 'Checking', 'checking');

    await commitImport(
      db,
      noContacts(),
      payload([
        row(card, '2026-07-10', 'c1', { balanceCents: 65_000 }),
        row(checking, '2026-07-10', 'k1'),
      ])
    );

    const kinds = db
      .select({ accountId: importBatches.accountId, kind: importBatches.sourceKind })
      .from(importBatches)
      .all();
    expect(kinds).toEqual(
      expect.arrayContaining([
        { accountId: card, kind: 'pdf-statement' },
        { accountId: checking, kind: 'csv-dialect' },
      ])
    );
  });

  it('writes no batch for an account whose every row failed, and counts only written rows', async () => {
    const { db } = freshMigratedFinanceDb();
    const card = seedAccount(db, 'Card', 'credit-card');

    const result = await commitImport(
      db,
      noContacts(),
      payload([
        row(card, '2026-07-10', 'ok'),
        // A positive amount with no declared type is refused at the column
        // mapper (POPS-2754), so this row fails to write.
        row(card, '2026-07-11', 'bad', { amount: 5, transactionType: undefined }),
        row('missing-account', '2026-07-12', 'orphan'),
      ])
    );

    expect(result.transactionsImported).toBe(1);
    expect(result.transactionsFailed).toBe(2);
    const batches = db.select().from(importBatches).all();
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      accountId: card,
      rowCount: 1,
      dateFrom: '2026-07-10',
      dateTo: '2026-07-10',
    });
  });

  it('replays the recorded result on a repeated commit key instead of writing a second batch', async () => {
    const { db } = freshMigratedFinanceDb();
    const card = seedAccount(db, 'Card', 'credit-card');
    const commitKey = 'a2b3c4d5-0000-4000-8000-000000000002';

    const first = await commitImport(
      db,
      noContacts(),
      payload([row(card, '2026-07-10', 'c1')], { commitKey })
    );
    const second = await commitImport(
      db,
      noContacts(),
      payload([row(card, '2026-07-10', 'c1')], { commitKey })
    );

    expect(second).toEqual(first);
    expect(db.select().from(importBatches).all()).toHaveLength(1);
  });

  it('writes nothing when the surrounding transaction rolls back', () => {
    const { db } = freshMigratedFinanceDb();
    const card = seedAccount(db, 'Card', 'credit-card');
    const id = crypto.randomUUID();
    db.insert(transactions)
      .values({
        id,
        description: 'row',
        accountId: card,
        amountCents: -100,
        date: '2026-07-01',
        type: 'purchase',
        lastEditedTime: '2026-09-06T00:00:00.000Z',
      })
      .run();

    expect(() =>
      db.transaction((tx) => {
        recordImportBatchesPhase(tx, {
          inserted: [{ id, accountId: card, date: '2026-07-01', carriesBalance: false }],
          source: { kind: 'csv-dialect', dialectId: 'Amex' },
          checkpoints: [],
          commitKey: undefined,
        });
        throw new Error('later phase failed');
      })
    ).toThrow('later phase failed');

    expect(db.select().from(importBatches).all()).toEqual([]);
    expect(
      db.select().from(transactions).where(eq(transactions.id, id)).get()?.importBatchId
    ).toBeNull();
  });
});
