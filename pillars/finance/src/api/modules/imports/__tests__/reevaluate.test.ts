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
  transactionTagRules,
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

function seedTagRule(pattern: string, tags: string[]): void {
  db.insert(transactionTagRules)
    .values({
      descriptionPattern: pattern,
      matchType: 'contains',
      tags: JSON.stringify(tags),
      isActive: true,
      confidence: 0.95,
      priority: 0,
    })
    .run();
}

function seedWeakRule(id: string): void {
  db.insert(transactionCorrections)
    .values({
      id,
      descriptionPattern: 'COLES',
      matchType: 'contains',
      entityId: 'ent-coles',
      entityName: 'Coles',
      tags: '[]',
      isActive: true,
      confidence: 0.72,
      priority: 0,
    })
    .run();
}

function seedTypedRule(id: string): void {
  db.insert(transactionCorrections)
    .values({
      id,
      descriptionPattern: '4564XXXXXXXX7373',
      matchType: 'contains',
      entityId: 'ent-anz',
      entityName: 'ANZ',
      transactionType: 'transfer',
      tags: '[]',
      isActive: true,
      confidence: 0.7,
      priority: 0,
    })
    .run();
}

function seedTypeOnlyRule(id: string): void {
  db.insert(transactionCorrections)
    .values({
      id,
      descriptionPattern: 'COLES',
      matchType: 'contains',
      transactionType: 'transfer',
      tags: '[]',
      isActive: true,
      confidence: 0.7,
      priority: 0,
    })
    .run();
}

function seedPurchaseTypeRule(id: string): void {
  db.insert(transactionCorrections)
    .values({
      id,
      descriptionPattern: 'COLES',
      matchType: 'contains',
      transactionType: 'purchase',
      tags: '[]',
      isActive: true,
      confidence: 0.72,
      priority: 0,
    })
    .run();
}

function correctionRow(id: string): { timesApplied: number; lastUsedAt: string | null } {
  const row = db
    .select()
    .from(transactionCorrections)
    .where(eq(transactionCorrections.id, id))
    .get();
  if (!row) throw new Error(`rule ${id} vanished`);
  return row;
}

function tagRuleTimesApplied(pattern: string): number {
  const row = db
    .select()
    .from(transactionTagRules)
    .where(eq(transactionTagRules.descriptionPattern, pattern))
    .get();
  if (!row) throw new Error(`tag rule ${pattern} vanished`);
  return row.timesApplied;
}

function lastUsedAt(id: string): string | null {
  return correctionRow(id).lastUsedAt;
}

const SENTINEL_STAMP = '2020-01-01T00:00:00.000Z';

function stampLastUsedAt(id: string, stamp: string): void {
  db.update(transactionCorrections)
    .set({ lastUsedAt: stamp })
    .where(eq(transactionCorrections.id, id))
    .run();
}

function timesApplied(id: string): number {
  return correctionRow(id).timesApplied;
}

function uncertainTxn(description: string): ProcessedTransaction {
  return {
    date: '2026-01-01',
    description,
    amount: -20,
    dialectAccountLabel: 'Amex',
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
    });

    expect(affectedCount).toBe(0);
    expect(nextResult.matched).toEqual([untouched]);
    expect(nextResult.uncertain).toHaveLength(0);
  });

  it('applies a below-the-bar rule to a matched row without demoting it', async () => {
    // 0.72 clears minConfidence (0.7) so the rule matches, but sits under
    // HIGH_CONFIDENCE_THRESHOLD (0.9), so its outcome bucket is `uncertain`.
    // That bucket used to make the whole outcome be discarded, which turned
    // every hand-written rule (they default to 0.7) into a no-op on the rows
    // it was written for. The row takes the rule and stays matched.
    seedWeakRule('r-weak');
    const alreadyMatched = matchedTxn('COLES SYDNEY', {
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
      matchType: 'ai',
    });

    const { nextResult, affectedCount } = await reevaluateImportSessionResult({
      db,
      contacts: makeContactsFake(),
      result: { matched: [alreadyMatched], uncertain: [], failed: [], skipped: [] },
    });

    expect(affectedCount).toBe(1);
    expect(nextResult.uncertain).toHaveLength(0);
    expect(nextResult.matched).toHaveLength(1);
    expect(nextResult.matched[0]?.status).toBe('matched');
    expect(nextResult.matched[0]?.entity).toMatchObject({
      entityId: 'ent-coles',
      entityName: 'Coles',
      matchType: 'learned',
    });
    expect(timesApplied('r-weak')).toBe(1);
  });

  it('gives a matched row the type a below-the-bar rule names (POPS-3120)', async () => {
    // The reported bug: rows auto-matched to ANZ as an expense, a hand-written
    // rule saying "this descriptor is an ANZ transfer", and nothing changing.
    seedTypedRule('r-transfer');
    const autoMatched: ProcessedTransaction = {
      ...matchedTxn('ANZ M-BANKING FUNDS TFER TRANSFER 754244 TO 4564XXXXXXXX7373', {
        entityId: 'ent-anz',
        entityName: 'ANZ',
        matchType: 'exact',
      }),
      transactionType: 'purchase',
    };

    const { nextResult, affectedCount } = await reevaluateImportSessionResult({
      db,
      contacts: makeContactsFake(),
      result: { matched: [autoMatched], uncertain: [], failed: [], skipped: [] },
    });

    expect(affectedCount).toBe(1);
    expect(nextResult.matched).toHaveLength(1);
    expect(nextResult.matched[0]?.transactionType).toBe('transfer');
    expect(nextResult.matched[0]?.status).toBe('matched');
  });

  it('keeps the row entity when a below-the-bar type-only rule re-decides it', async () => {
    // An entity-less rule builds an entity-less placeholder, which would erase
    // the merchant of a row that already had one.
    seedTypeOnlyRule('r-type-only');
    const alreadyMatched = matchedTxn('COLES SYDNEY', {
      entityId: 'ent-coles',
      entityName: 'Coles',
      matchType: 'exact',
    });

    const { nextResult } = await reevaluateImportSessionResult({
      db,
      contacts: makeContactsFake(),
      result: { matched: [alreadyMatched], uncertain: [], failed: [], skipped: [] },
    });

    expect(nextResult.matched[0]?.entity).toMatchObject({
      entityId: 'ent-coles',
      entityName: 'Coles',
    });
    expect(nextResult.matched[0]?.transactionType).toBe('transfer');
  });

  it('credits usage exactly once for a matched row the rule does re-decide', async () => {
    seedRule('r-1');
    const sibling = matchedTxn('COLES SYDNEY', {
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
      matchType: 'ai',
    });

    await reevaluateImportSessionResult({
      db,
      contacts: makeContactsFake(),
      result: { matched: [sibling], uncertain: [], failed: [], skipped: [] },
    });

    expect(timesApplied('r-1')).toBe(1);
  });

  it('never credits usage from the pending-preview path, matched rows included', async () => {
    seedRule('r-1');
    const sibling = matchedTxn('COLES SYDNEY', {
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
      matchType: 'ai',
    });

    const { affectedCount } = await reevaluateImportSessionWithRules({
      db,
      contacts: makeContactsFake(),
      result: { matched: [sibling], uncertain: [], failed: [], skipped: [] },
      pendingChangeSets: [],
    });

    expect(affectedCount).toBe(1);
    expect(timesApplied('r-1')).toBe(0);
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
      pendingChangeSets: [],
    });

    expect(affectedCount).toBe(1);
    expect(timesApplied('r-1')).toBe(0);
  });
});

/**
 * POPS-2607 re-tags the whole ledger by re-running re-evaluation rather than
 * editing rows, on the premise that the result is reproducible. That premise is
 * load-bearing — an operator reviews the diff of one run, not each row — and
 * nothing asserted it, so a rule that flip-flopped or a tag pass that appended
 * on every run would have been discovered by the re-tag itself.
 */
describe('reevaluate — running twice over the same data is idempotent (POPS-2607)', () => {
  it('leaves the second run with nothing to affect and an identical result', async () => {
    seedRule('r-1');
    const contacts = makeContactsFake({ seed: [{ id: 'ent-coles', name: 'Coles' }] });
    const result = emptyResult([uncertainTxn('COLES SYDNEY 1'), uncertainTxn('COLES SYDNEY 2')]);

    const first = await reevaluateImportSessionResult({
      db,
      contacts,
      result,
    });
    const second = await reevaluateImportSessionResult({
      db,
      contacts,
      result: first.nextResult,
    });

    expect(first.affectedCount).toBe(2);
    expect(second.affectedCount).toBe(0);
    expect(second.nextResult).toEqual(first.nextResult);
  });

  it('does not append the same suggested tag again on the second run', async () => {
    seedTagRule('COLES', ['venue:supermarket', 'contains:groceries']);
    const contacts = makeContactsFake({ seed: [{ id: 'ent-coles', name: 'Coles' }] });

    const first = await reevaluateImportSessionResult({
      db,
      contacts,
      result: emptyResult([uncertainTxn('COLES SYDNEY')]),
    });
    const second = await reevaluateImportSessionResult({
      db,
      contacts,
      result: first.nextResult,
    });

    const tagsOf = (output: ProcessImportOutput): string[] =>
      (output.matched[0]?.suggestedTags ?? []).map((s) => s.tag);

    expect(tagsOf(first.nextResult)).toEqual(['venue:supermarket', 'contains:groceries']);
    expect(tagsOf(second.nextResult)).toEqual(tagsOf(first.nextResult));
  });

  it('is idempotent for a row already matched to the entity the rule names', async () => {
    seedRule('r-1');
    const alreadyRight = matchedTxn('COLES SYDNEY', {
      entityId: 'ent-coles',
      entityName: 'Coles',
      matchType: 'learned',
      confidence: 0.95,
    });
    const input: ProcessImportOutput = {
      matched: [alreadyRight],
      uncertain: [],
      failed: [],
      skipped: [],
    };

    const first = await reevaluateImportSessionResult({
      db,
      contacts: makeContactsFake(),
      result: input,
    });
    const second = await reevaluateImportSessionResult({
      db,
      contacts: makeContactsFake(),
      result: first.nextResult,
    });

    expect(first.affectedCount).toBe(0);
    expect(second.nextResult).toEqual(first.nextResult);
  });

  it('does not re-credit usage telemetry on a run that changes nothing (POPS-2641)', async () => {
    seedRule('r-1');
    const contacts = makeContactsFake({ seed: [{ id: 'ent-coles', name: 'Coles' }] });

    const first = await reevaluateImportSessionResult({
      db,
      contacts,
      result: emptyResult([uncertainTxn('COLES SYDNEY')]),
    });
    expect(timesApplied('r-1')).toBe(1);
    // A sentinel rather than the real stamp: both runs land in the same
    // millisecond, so comparing the two stamps would pass even if the second
    // run rewrote it.
    stampLastUsedAt('r-1', SENTINEL_STAMP);

    const second = await reevaluateImportSessionResult({
      db,
      contacts,
      result: first.nextResult,
    });

    expect(second.affectedCount).toBe(0);
    expect(timesApplied('r-1')).toBe(1);
    expect(lastUsedAt('r-1')).toBe(SENTINEL_STAMP);
  });

  it('does not re-credit a row the rule leaves in the uncertain bucket', async () => {
    // An entity-less purchase rule always leaves the row uncertain (no
    // merchant resolved yet, ADR-053) across both runs and never reaches the
    // matched-row path — the gate has to hold on the full ladder too, not
    // only on the re-apply branch.
    seedPurchaseTypeRule('r-purchase-only');
    const contacts = makeContactsFake({ seed: [{ id: 'ent-coles', name: 'Coles' }] });

    const first = await reevaluateImportSessionResult({
      db,
      contacts,
      result: emptyResult([uncertainTxn('COLES SYDNEY')]),
    });
    expect(first.nextResult.uncertain).toHaveLength(1);
    expect(timesApplied('r-purchase-only')).toBe(1);

    await reevaluateImportSessionResult({
      db,
      contacts,
      result: first.nextResult,
    });

    expect(timesApplied('r-purchase-only')).toBe(1);
  });

  it('does not re-credit the tag rules a no-op run re-matches', async () => {
    seedRule('r-1');
    seedTagRule('COLES', ['venue:supermarket']);
    const contacts = makeContactsFake({ seed: [{ id: 'ent-coles', name: 'Coles' }] });

    const first = await reevaluateImportSessionResult({
      db,
      contacts,
      result: emptyResult([uncertainTxn('COLES SYDNEY')]),
    });
    expect(tagRuleTimesApplied('COLES')).toBe(1);

    await reevaluateImportSessionResult({
      db,
      contacts,
      result: first.nextResult,
    });

    expect(tagRuleTimesApplied('COLES')).toBe(1);
  });

  it('still credits a row the run does move, exactly once', async () => {
    seedRule('r-1');
    const wronglyMatched = matchedTxn('COLES SYDNEY', {
      entityId: 'ent-woolies',
      entityName: 'Woolworths',
      matchType: 'ai',
    });

    const first = await reevaluateImportSessionResult({
      db,
      contacts: makeContactsFake(),
      result: { matched: [wronglyMatched], uncertain: [], failed: [], skipped: [] },
    });

    expect(first.affectedCount).toBe(1);
    expect(timesApplied('r-1')).toBe(1);

    await reevaluateImportSessionResult({
      db,
      contacts: makeContactsFake(),
      result: first.nextResult,
    });

    expect(timesApplied('r-1')).toBe(1);
  });
});
