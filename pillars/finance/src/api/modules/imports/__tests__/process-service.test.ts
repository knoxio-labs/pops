/**
 * Regression test for CF040/#3664: the correction rule set must be fetched
 * once per import run and threaded through every transaction's classification
 * instead of each row re-querying + re-sorting the whole `transaction_corrections`
 * table.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  openFinanceDb,
  transactionCorrections,
  transactionCorrectionsService,
  type FinanceDb,
  type OpenedFinanceDb,
} from '../../../../db/index.js';
import { makeContactsFake } from '../../../__tests__/contacts-fake.js';
import { processImportCore } from '../process-service.js';

import type { ParsedTransaction } from '../types.js';

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-process-service-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function seedRule(): void {
  db.insert(transactionCorrections)
    .values({
      id: crypto.randomUUID(),
      descriptionPattern: 'COLES',
      matchType: 'contains',
      entityId: 'ent-coles',
      entityName: 'Coles',
      tags: '[]',
      isActive: true,
      confidence: 0.95,
      priority: 0,
    })
    .run();
}

function parsed(description: string, checksum: string): ParsedTransaction {
  return {
    date: '2026-01-01',
    description,
    amount: -20,
    account: 'Amex',
    rawRow: description,
    checksum,
  };
}

describe('processImportCore — correction rule set is fetched once per run (CF040/#3664)', () => {
  it('never re-queries the DB per transaction; every row still classifies against the rule', async () => {
    seedRule();
    const listSpy = vi.spyOn(transactionCorrectionsService, 'listTransactionCorrections');
    const perTxnSpy = vi.spyOn(
      transactionCorrectionsService,
      'findAllMatchingTransactionCorrectionsFromDb'
    );

    const transactions = Array.from({ length: 5 }, (_, i) => parsed('COLES SYDNEY', `coles-${i}`));

    const { output } = await processImportCore({
      db,
      contacts: makeContactsFake(),
      transactions,
      account: 'Amex',
      importBatchId: 'batch-1',
    });

    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(perTxnSpy).not.toHaveBeenCalled();

    expect(output.matched).toHaveLength(5);
    expect(output.matched.every((t) => t.entity.entityId === 'ent-coles')).toBe(true);
  });

  it('fetches the rule set exactly once regardless of how many transactions are processed', async () => {
    seedRule();
    const listSpy = vi.spyOn(transactionCorrectionsService, 'listTransactionCorrections');

    const transactions = Array.from({ length: 20 }, (_, i) => parsed('COLES SYDNEY', `bulk-${i}`));

    await processImportCore({
      db,
      contacts: makeContactsFake(),
      transactions,
      account: 'Amex',
      importBatchId: 'batch-2',
    });

    expect(listSpy).toHaveBeenCalledTimes(1);
  });
});
