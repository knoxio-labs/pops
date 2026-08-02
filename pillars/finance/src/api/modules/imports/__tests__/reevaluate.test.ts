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

function matchedTxn(
  description: string,
  entity: ProcessedTransaction['entity']
): ProcessedTransaction {
  return { ...uncertainTxn(description), status: 'matched', entity };
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

describe('reevaluate — a new rule reaches rows that were already matched (#3814)', () => {
  it('re-decides a wrongly auto-matched sibling instead of passing it through', async () => {
    // The reported bug: the user corrects one AI-matched row, the proposal
    // says two transactions are affected, and only the hand-fixed one changes
    // — because `matched` was copied through verbatim.
    seedRule('r-1');
    const wronglyMatched = matchedTxn('COLES SYDNEY 2', {
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
      matchType: 'ai',
      confidence: 0.85,
    });

    const { nextResult, affectedCount } = await reevaluateImportSessionResult({
      db,
      contacts: makeContactsFake(),
      result: { matched: [wronglyMatched], uncertain: [], failed: [], skipped: [] },
      minConfidence: 0.7,
    });

    expect(affectedCount).toBe(1);
    expect(nextResult.matched).toHaveLength(1);
    expect(nextResult.matched[0]?.entity).toMatchObject({
      entityId: 'ent-coles',
      entityName: 'Coles',
      matchType: 'learned',
    });
  });

  it('counts both the matched sibling and the unmatched row the rule covers', async () => {
    seedRule('r-1');
    const sibling = matchedTxn('COLES SYDNEY 2', {
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
      matchType: 'ai',
    });

    const { nextResult, affectedCount } = await reevaluateImportSessionResult({
      db,
      contacts: makeContactsFake(),
      result: {
        matched: [sibling],
        uncertain: [uncertainTxn('COLES SYDNEY 1')],
        failed: [],
        skipped: [],
      },
      minConfidence: 0.7,
    });

    expect(affectedCount).toBe(2);
    expect(nextResult.matched).toHaveLength(2);
    expect(nextResult.uncertain).toHaveLength(0);
    expect(nextResult.matched.every((t) => t.entity.entityName === 'Coles')).toBe(true);
  });

  it('leaves a matched row no rule covers exactly as it was', async () => {
    seedRule('r-1');
    const untouched = matchedTxn('BUNNINGS KINGSGROVE', {
      entityId: 'ent-bunnings',
      entityName: 'Bunnings',
      matchType: 'exact',
    });

    const { nextResult, affectedCount } = await reevaluateImportSessionResult({
      db,
      contacts: makeContactsFake(),
      result: { matched: [untouched], uncertain: [], failed: [], skipped: [] },
      minConfidence: 0.7,
    });

    expect(affectedCount).toBe(0);
    expect(nextResult.matched).toEqual([untouched]);
    expect(nextResult.uncertain).toHaveLength(0);
  });

  it('never demotes a matched row when the covering rule resolves below the match bar', async () => {
    // A rule whose confidence keeps it short of `matched` would hand a row the
    // user had already dealt with back to the uncertain pile. Re-evaluation
    // propagates approved rules; it does not relitigate settled rows.
    db.insert(transactionCorrections)
      .values({
        id: 'r-weak',
        descriptionPattern: 'COLES',
        matchType: 'contains',
        entityId: 'ent-coles',
        entityName: 'Coles',
        tags: '[]',
        isActive: true,
        confidence: 0.72,
        priority: 0,
        needsReview: true,
      })
      .run();
    const alreadyMatched = matchedTxn('COLES SYDNEY', {
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
      matchType: 'ai',
    });

    const { nextResult } = await reevaluateImportSessionResult({
      db,
      contacts: makeContactsFake(),
      result: { matched: [alreadyMatched], uncertain: [], failed: [], skipped: [] },
      minConfidence: 0.7,
    });

    // 0.72 clears minConfidence (0.7) so the rule matches, but sits under
    // HIGH_CONFIDENCE_THRESHOLD (0.9) so it resolves to `uncertain` — the
    // discarded outcome. Asserting the entity is untouched proves the guard
    // fired rather than the rule quietly resolving to `matched`.
    expect(nextResult.uncertain).toHaveLength(0);
    expect(nextResult.matched).toHaveLength(1);
    expect(nextResult.matched[0]?.entity.entityName).toBe('Woolworths');
  });

  it('preserves the relative order of the matched bucket', async () => {
    seedRule('r-1');
    const first = matchedTxn('BUNNINGS 1', { entityName: 'Bunnings', matchType: 'exact' });
    const second = matchedTxn('COLES SYDNEY', { entityName: 'Woolworths', matchType: 'ai' });
    const third = matchedTxn('BUNNINGS 2', { entityName: 'Bunnings', matchType: 'exact' });

    const { nextResult } = await reevaluateImportSessionResult({
      db,
      contacts: makeContactsFake(),
      result: { matched: [first, second, third], uncertain: [], failed: [], skipped: [] },
      minConfidence: 0.7,
    });

    expect(nextResult.matched.map((t) => t.checksum)).toEqual([
      first.checksum,
      second.checksum,
      third.checksum,
    ]);
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
