/**
 * Regression tests for CF014 (#3620): `moveToMatched` (Accept-All /
 * Create-entity-for-all) must dedupe by checksum the same way
 * `moveOneToMatched` does (#3590), not filter by object reference and
 * unconditionally append.
 */
import { describe, expect, it } from 'vitest';

import { moveToMatched, type LocalTxState } from './types';

import type { ProcessedTransaction } from '../../../../store/importStore';

function makeProcessed(
  checksum: string,
  overrides: Partial<ProcessedTransaction> = {}
): ProcessedTransaction {
  return {
    date: '2026-02-06',
    description: `TXN ${checksum}`,
    amount: -44.63,
    dialectAccountLabel: 'Amex',
    rawRow: `{"checksum":"${checksum}"}`,
    checksum,
    entity: { matchType: 'none' },
    status: 'uncertain',
    ...overrides,
  };
}

function emptyState(overrides: Partial<LocalTxState> = {}): LocalTxState {
  return { matched: [], uncertain: [], failed: [], skipped: [], ...overrides };
}

describe('moveToMatched', () => {
  it('replaces an already-matched transaction in place instead of appending a duplicate', () => {
    const other = makeProcessed('maccas', { status: 'matched', entity: { matchType: 'ai' } });
    const alreadyMatched = makeProcessed('bunnings', {
      description: 'BUNNINGS WAREHOUSE KING KINGSGROVE',
      status: 'matched',
      entity: { entityName: 'Bunnings Warehouse', matchType: 'ai', confidence: 0.8 },
    });
    const prev = emptyState({ matched: [other, alreadyMatched] });

    // A separate object reference for the same checksum, as arrives when
    // Accept-All is invoked from a re-rendered transaction list.
    const incoming = makeProcessed('bunnings', {
      description: 'BUNNINGS WAREHOUSE KING KINGSGROVE',
      status: 'matched',
      entity: { entityName: 'Bunnings Warehouse', matchType: 'ai', confidence: 0.8 },
    });

    const next = moveToMatched(prev, [incoming], {
      entityId: 'ent-bunnings',
      entityName: 'Bunnings Warehouse',
    });

    expect(next.matched).toHaveLength(2);
    expect(next.matched.filter((t) => t.checksum === 'bunnings')).toHaveLength(1);
    expect(next.matched[1]?.checksum).toBe('bunnings');
    expect(next.matched[1]?.entity).toEqual({
      entityId: 'ent-bunnings',
      entityName: 'Bunnings Warehouse',
      matchType: 'manual',
      confidence: 1,
    });
    expect(next.matched[0]).toBe(other);
  });

  it('collapses duplicate matched rows for the same checksum across a bulk batch', () => {
    const dupeA = makeProcessed('dupe', { status: 'matched', description: 'FIRST COPY' });
    const dupeB = makeProcessed('dupe', { status: 'matched', description: 'SECOND COPY' });
    const prev = emptyState({ matched: [dupeA, dupeB] });

    const next = moveToMatched(prev, [makeProcessed('dupe')], {
      entityId: 'ent-x',
      entityName: 'X Corp',
    });

    expect(next.matched).toHaveLength(1);
    expect(next.matched[0]?.checksum).toBe('dupe');
  });

  it('appends transactions not already matched, removing them from uncertain and failed', () => {
    const uncertain = makeProcessed('unknown-1', { status: 'uncertain' });
    const failed = makeProcessed('unknown-2', { status: 'failed' });
    const prev = emptyState({ uncertain: [uncertain], failed: [failed] });

    const next = moveToMatched(prev, [uncertain, failed], {
      entityId: 'ent-y',
      entityName: 'Y Ltd',
    });

    expect(next.uncertain).toHaveLength(0);
    expect(next.failed).toHaveLength(0);
    expect(next.matched.map((t) => t.checksum).toSorted()).toEqual(['unknown-1', 'unknown-2']);
    expect(next.matched.every((t) => t.status === 'matched')).toBe(true);
  });

  it('defaults matchType to manual when none is given', () => {
    const prev = emptyState({ uncertain: [makeProcessed('a')] });

    const next = moveToMatched(prev, [makeProcessed('a')], {
      entityId: 'ent-a',
      entityName: 'A Corp',
    });

    expect(next.matched[0]?.entity).toMatchObject({ matchType: 'manual' });
  });
});
