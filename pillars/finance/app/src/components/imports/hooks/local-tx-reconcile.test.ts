import { describe, expect, it } from 'vitest';

import {
  collectChangedChecksums,
  mergeReevaluatedResult,
  type LocalTxState,
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
    account: 'Amex',
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
