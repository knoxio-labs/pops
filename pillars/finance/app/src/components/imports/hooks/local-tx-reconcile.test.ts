import { describe, expect, it } from 'vitest';

import {
  bucketOfChecksum,
  collectChangedChecksums,
  mergeReevaluatedResult,
  replaceByChecksum,
  TX_BUCKETS,
  type LocalTxState,
  type TxBucket,
} from './local-tx-reconcile';

import type { ProcessedTransaction } from '../../../store/importStore';

function makeTx(
  checksum: string,
  overrides: Partial<ProcessedTransaction> = {}
): ProcessedTransaction {
  return {
    date: '2026-02-06',
    description: `TXN ${checksum}`,
    amount: -12.5,
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

describe('collectChangedChecksums', () => {
  it('flags a checksum that moved bucket', () => {
    const tx = makeTx('a', { status: 'uncertain' });
    const prev = emptyState({ uncertain: [tx] });
    const next = emptyState({ matched: [{ ...tx, status: 'matched' }] });

    expect(collectChangedChecksums(prev, next)).toEqual(['a']);
  });

  it('flags a checksum replaced by a new object in the same bucket', () => {
    const tx = makeTx('a', { status: 'matched' });
    const prev = emptyState({ matched: [tx] });
    const next = emptyState({ matched: [{ ...tx, description: 'edited' }] });

    expect(collectChangedChecksums(prev, next)).toEqual(['a']);
  });

  it('reports no changes when nothing moved or was replaced', () => {
    const tx = makeTx('a', { status: 'matched' });
    const prev = emptyState({ matched: [tx] });
    const next = emptyState({ matched: [tx] });

    expect(collectChangedChecksums(prev, next)).toEqual([]);
  });
});

describe('mergeReevaluatedResult', () => {
  it('returns the server result untouched when nothing was resolved locally', () => {
    const serverResult = emptyState({ uncertain: [makeTx('a')] });

    const merged = mergeReevaluatedResult(emptyState(), serverResult, new Set());

    expect(merged).toBe(serverResult);
  });

  it('keeps the locally-resolved transaction instead of the server reevaluation of it', () => {
    // The user manually resolved "a" to matched with entity X; the server's
    // from-scratch reevaluation (triggered by an unrelated correction) still
    // categorizes "a" as uncertain because it has no knowledge of that pick.
    const resolvedTx = makeTx('a', {
      status: 'matched',
      entity: { entityId: 'ent-x', entityName: 'X Corp', matchType: 'manual' },
    });
    const prevLocal = emptyState({ matched: [resolvedTx] });
    const serverResult = emptyState({ uncertain: [makeTx('a', { status: 'uncertain' })] });

    const merged = mergeReevaluatedResult(prevLocal, serverResult, new Set(['a']));

    expect(merged.uncertain).toEqual([]);
    expect(merged.matched).toEqual([resolvedTx]);
  });

  it('applies the server reevaluation to transactions the user never touched', () => {
    const resolvedTx = makeTx('a', { status: 'matched' });
    const prevLocal = emptyState({ matched: [resolvedTx], uncertain: [makeTx('b')] });
    const serverResult = emptyState({
      uncertain: [makeTx('a', { status: 'uncertain' })],
      matched: [makeTx('b', { status: 'matched' })],
    });

    const merged = mergeReevaluatedResult(prevLocal, serverResult, new Set(['a']));

    expect(merged.matched.map((t) => t.checksum).toSorted()).toEqual(['a', 'b']);
    expect(merged.uncertain).toEqual([]);
  });
});

function allChecksums(state: LocalTxState): string[] {
  return TX_BUCKETS.flatMap((bucket) => state[bucket].map((t) => t.checksum)).toSorted();
}

describe('replaceByChecksum', () => {
  for (const from of TX_BUCKETS) {
    for (const to of TX_BUCKETS) {
      it(`moves a card from ${from} to ${to} without duplicating or losing siblings`, () => {
        const moving = makeTx('moving', { status: from });
        const siblingInTarget = makeTx('sibling-target', { status: to });
        const untouchedBucket = TX_BUCKETS.find((b) => b !== from && b !== to);
        const untouched = untouchedBucket
          ? makeTx('sibling-elsewhere', { status: untouchedBucket })
          : null;

        const buckets: Record<TxBucket, ProcessedTransaction[]> = {
          matched: [],
          uncertain: [],
          failed: [],
          skipped: [],
        };
        buckets[from] = from === to ? [moving, siblingInTarget] : [moving];
        if (from !== to) buckets[to] = [siblingInTarget];
        if (untouchedBucket && untouched) buckets[untouchedBucket] = [untouched];
        const prev: LocalTxState = buckets;

        const next = replaceByChecksum(prev, 'moving', to, () => ({
          ...moving,
          status: to,
        }));

        // Exactly one copy of the moved checksum, and it lives in `to`.
        expect(allChecksums(next).filter((c) => c === 'moving')).toHaveLength(1);
        expect(bucketOfChecksum(next, 'moving')).toBe(to);
        // No card was dropped: every other checksum that existed before still exists exactly once.
        const prevOthers = allChecksums(prev).filter((c) => c !== 'moving');
        const nextOthers = allChecksums(next).filter((c) => c !== 'moving');
        expect(nextOthers).toEqual(prevOthers);
      });
    }
  }

  it('replaces a card in place, preserving its position, when the target already holds it', () => {
    const other = makeTx('other', { status: 'matched' });
    const target = makeTx('target', { status: 'matched', description: 'ORIGINAL' });
    const prev = emptyState({ matched: [other, target] });

    const next = replaceByChecksum(prev, 'target', 'matched', () => ({
      ...target,
      description: 'EDITED',
    }));

    expect(next.matched).toHaveLength(2);
    expect(next.matched[1]).toMatchObject({ checksum: 'target', description: 'EDITED' });
    expect(next.matched[0]).toBe(other);
  });

  it('appends when the checksum is not present anywhere yet', () => {
    const fresh = makeTx('fresh', { status: 'uncertain' });
    const prev = emptyState();

    const next = replaceByChecksum(prev, 'fresh', 'uncertain', () => fresh);

    expect(next.uncertain).toEqual([fresh]);
  });

  it('collapses a corrupted duplicate that exists in two buckets at once down to a single copy', () => {
    const dupeInMatched = makeTx('dupe', { status: 'matched', description: 'IN MATCHED' });
    const dupeInUncertain = makeTx('dupe', { status: 'uncertain', description: 'IN UNCERTAIN' });
    const prev = emptyState({ matched: [dupeInMatched], uncertain: [dupeInUncertain] });

    const next = replaceByChecksum(prev, 'dupe', 'matched', () => ({
      ...dupeInMatched,
      description: 'RESOLVED',
    }));

    expect(allChecksums(next).filter((c) => c === 'dupe')).toHaveLength(1);
    expect(next.uncertain).toEqual([]);
    expect(next.matched).toEqual([{ ...dupeInMatched, description: 'RESOLVED' }]);
  });

  it('leaves buckets that never held the checksum referentially untouched', () => {
    const skipped = makeTx('skip-1', { status: 'skipped' });
    const failed = makeTx('failed-1', { status: 'failed' });
    const target = makeTx('target', { status: 'uncertain' });
    const prev = emptyState({ uncertain: [target], skipped: [skipped], failed: [failed] });

    const next = replaceByChecksum(prev, 'target', 'matched', () => ({
      ...target,
      status: 'matched',
    }));

    expect(next.skipped).toBe(prev.skipped);
    expect(next.failed).toBe(prev.failed);
  });

  it('is idempotent — replacing the same checksum twice does not grow the bucket', () => {
    const target = makeTx('target', { status: 'uncertain' });
    const prev = emptyState({ uncertain: [target] });
    const build = () => ({ ...target, status: 'matched' as const });

    const once = replaceByChecksum(prev, 'target', 'matched', build);
    const twice = replaceByChecksum(once, 'target', 'matched', build);

    expect(twice.matched).toHaveLength(1);
    expect(allChecksums(twice)).toEqual(['target']);
  });
});
