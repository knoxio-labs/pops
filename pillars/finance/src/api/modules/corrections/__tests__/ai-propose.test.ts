/**
 * `proposeChangeSetFromCorrectionSignal` must store a `regex` pattern
 * verbatim (POPS-2704). `normalizeDescription` uppercases every character
 * including metacharacters and strips digits — `\d{4}-\d{4}` becomes
 * `\D{} \D{}` — so a proposal that ran the pattern through it before
 * building the `add` op persisted a rule the matcher could never fire on,
 * even though `contract/pattern-match.ts` documents `regex` as stored raw.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { seededAccountId } from '../../../../db/__tests__/seeded-account.js';
import { transactions } from '../../../../db/schema/transactions.js';
import { proposeChangeSetFromCorrectionSignal } from '../ai-propose.js';

import type { FinanceDb } from '../../../../db/services/internal.js';
import type { CorrectionSignal } from '../ai-types.js';

function freshDb(): FinanceDb {
  return freshMigratedFinanceDb().db;
}

function insertTransaction(db: FinanceDb, id: string, description: string): void {
  db.insert(transactions)
    .values({
      id,
      description,
      accountId: seededAccountId(db, 'Amex'),
      amountCents: 1000,
      date: '2026-01-01',
      type: 'purchase',
      lastEditedTime: '2026-01-01T00:00:00.000Z',
    })
    .run();
}

describe('proposeChangeSetFromCorrectionSignal — regex pattern storage', () => {
  let db: FinanceDb;

  beforeEach(() => {
    db = freshDb();
  });

  it('persists a regex pattern verbatim and matches the transaction that triggered it', async () => {
    insertTransaction(db, 'tx-1', 'AMAZON MKTP 1234-5678 SYDNEY');

    const signal: CorrectionSignal = {
      descriptionPattern: '\\d{4}-\\d{4}',
      matchType: 'regex',
      entityId: 'ent-amazon',
      entityName: 'Amazon',
    };

    const result = await proposeChangeSetFromCorrectionSignal(db, {
      signal,
      minConfidence: 0,
      maxPreviewItems: 10,
    });

    const [op] = result.changeSet.ops;
    expect(op?.op).toBe('add');
    expect(op?.op === 'add' ? op.data.descriptionPattern : undefined).toBe('\\d{4}-\\d{4}');

    expect(result.preview.affected.map((a) => a.transactionId)).toContain('tx-1');
    expect(result.preview.affected[0]?.after.entityId).toBe('ent-amazon');
  });

  it('does not mangle a regex pattern that has no existing rule to edit', async () => {
    insertTransaction(db, 'tx-2', 'WOOLWORTHS 1034 CANTERBURY');

    const signal: CorrectionSignal = {
      descriptionPattern: 'WOOLWORTHS \\d{4}',
      matchType: 'regex',
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
    };

    const result = await proposeChangeSetFromCorrectionSignal(db, {
      signal,
      minConfidence: 0,
      maxPreviewItems: 10,
    });

    const [op] = result.changeSet.ops;
    expect(op?.op === 'add' ? op.data.descriptionPattern : undefined).toBe('WOOLWORTHS \\d{4}');
  });
});
