/**
 * Regression tests for CF040/#3664: `reevaluateImportSessionResult` must fetch
 * the correction rule set once per run (not per transaction) while still
 * counting as real usage telemetry — unlike `reevaluateImportSessionWithRules`,
 * whose merged rule set is always an un-persisted preview and must never bump
 * usage counters.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  openFinanceDb,
  transactionCorrections,
  transactionCorrectionsService,
  type FinanceDb,
  type OpenedFinanceDb,
} from '../../../../db/index.js';
import { makeContactsFake } from '../../../__tests__/contacts-fake.js';
import { reevaluateImportSessionResult, reevaluateImportSessionWithRules } from '../reevaluate.js';

import type { ProcessedTransaction, ProcessImportOutput } from '../types.js';

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-reevaluate-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function seedRule(id: string): void {
  db.insert(transactionCorrections)
    .values({
      id,
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

function timesApplied(id: string): number {
  const row = db
    .select()
    .from(transactionCorrections)
    .where(eq(transactionCorrections.id, id))
    .get();
  if (!row) throw new Error(`rule ${id} vanished`);
  return row.timesApplied;
}

function uncertainTxn(description: string): ProcessedTransaction {
  return {
    date: '2026-01-01',
    description,
    amount: -20,
    account: 'Amex',
    rawRow: description,
    checksum: crypto.randomUUID(),
    entity: { matchType: 'none' },
    status: 'uncertain',
  };
}

function emptyResult(uncertain: ProcessedTransaction[]): ProcessImportOutput {
  return { matched: [], uncertain, failed: [], skipped: [] };
}

describe('reevaluateImportSessionResult — fetch-once + real usage (CF040/#3664)', () => {
  it('fetches the rule set exactly once and still bumps usage telemetry', async () => {
    seedRule('r-1');
    const listSpy = vi.spyOn(transactionCorrectionsService, 'listTransactionCorrections');
    const perTxnSpy = vi.spyOn(
      transactionCorrectionsService,
      'findAllMatchingTransactionCorrectionsFromDb'
    );

    const result = emptyResult([
      uncertainTxn('COLES SYDNEY 1'),
      uncertainTxn('COLES SYDNEY 2'),
      uncertainTxn('COLES SYDNEY 3'),
    ]);

    const { nextResult, affectedCount } = await reevaluateImportSessionResult({
      db,
      contacts: makeContactsFake(),
      result,
      minConfidence: 0.7,
    });

    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(perTxnSpy).not.toHaveBeenCalled();
    expect(affectedCount).toBe(3);
    expect(nextResult.matched).toHaveLength(3);
    expect(timesApplied('r-1')).toBe(3);
  });
});

describe('reevaluateImportSessionWithRules — pending preview never counts as usage (CF040/#3664)', () => {
  it('does not bump usage telemetry even with an empty pendingChangeSets array', async () => {
    seedRule('r-1');

    const result = emptyResult([uncertainTxn('COLES SYDNEY')]);

    const { affectedCount } = await reevaluateImportSessionWithRules({
      db,
      contacts: makeContactsFake(),
      result,
      minConfidence: 0.7,
      pendingChangeSets: [],
    });

    expect(affectedCount).toBe(1);
    expect(timesApplied('r-1')).toBe(0);
  });
});
