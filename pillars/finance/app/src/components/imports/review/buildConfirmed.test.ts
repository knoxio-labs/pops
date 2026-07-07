import { describe, expect, it } from 'vitest';

import { buildConfirmedTransactions, isConfirmable, partitionConfirmable } from './buildConfirmed';

import type { ProcessedTransaction } from '../../../store/importStore';

function matched(overrides: Partial<ProcessedTransaction> = {}): ProcessedTransaction {
  return {
    date: '2026-02-13',
    description: 'WOOLWORTHS 1234',
    amount: -42.5,
    account: 'Amex',
    rawRow: '{}',
    checksum: 'chk-1',
    status: 'matched',
    entity: { entityId: 'ent-1', entityName: 'Woolworths', matchType: 'exact' },
    ...overrides,
  };
}

describe('buildConfirmedTransactions', () => {
  it('keeps a matched entity row and carries the matcher provenance', () => {
    const [confirmed] = buildConfirmedTransactions([matched()]);

    expect(confirmed).toMatchObject({
      entityId: 'ent-1',
      entityName: 'Woolworths',
      matchType: 'exact',
    });
    expect(confirmed?.matchRuleId).toBeUndefined();
    expect(confirmed?.matchConfidence).toBeUndefined();
  });

  it('carries confidence for an AI match', () => {
    const [confirmed] = buildConfirmedTransactions([
      matched({
        entity: { entityId: 'ent-2', entityName: 'Netflix', matchType: 'ai', confidence: 0.82 },
      }),
    ]);

    expect(confirmed?.matchType).toBe('ai');
    expect(confirmed?.matchConfidence).toBe(0.82);
  });

  it('carries the winning rule id and confidence for a learned-correction match', () => {
    const [confirmed] = buildConfirmedTransactions([
      matched({
        entity: {
          entityId: 'ent-3',
          entityName: 'Spotify',
          matchType: 'learned',
          confidence: 0.95,
        },
        ruleProvenance: {
          source: 'correction',
          ruleId: 'rule-1',
          pattern: 'SPOTIFY',
          matchType: 'exact',
          confidence: 0.95,
        },
      }),
    ]);

    expect(confirmed?.matchType).toBe('learned');
    expect(confirmed?.matchRuleId).toBe('rule-1');
    expect(confirmed?.matchConfidence).toBe(0.95);
  });

  it('keeps a transfer row with no entity and no match provenance beyond matchType none', () => {
    const [confirmed] = buildConfirmedTransactions([
      matched({ transactionType: 'transfer', entity: { matchType: 'none' } }),
    ]);

    expect(confirmed).toMatchObject({ transactionType: 'transfer', matchType: 'none' });
    expect(confirmed?.entityId).toBeUndefined();
  });

  it('drops a matched row missing both entityId and entityName (no provenance to persist)', () => {
    const result = buildConfirmedTransactions([matched({ entity: { matchType: 'exact' } })]);

    expect(result).toHaveLength(0);
  });

  it('keeps an entity-optional credit type (loan) with no entity — not silently dropped (#3607)', () => {
    const result = buildConfirmedTransactions([
      matched({ transactionType: 'loan', entity: { matchType: 'none' } }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ transactionType: 'loan' });
  });

  it('keeps a reversal with no entity — bank-initiated reversals have no merchant (#3757)', () => {
    const result = buildConfirmedTransactions([
      matched({ transactionType: 'reversal', entity: { matchType: 'none' } }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ transactionType: 'reversal' });
  });

  it('still drops a refund with no entity (merchant transactions require a payee)', () => {
    const result = buildConfirmedTransactions([
      matched({ transactionType: 'refund', entity: { matchType: 'none' } }),
    ]);

    expect(result).toHaveLength(0);
  });
});

describe('partitionConfirmable (#3765 — dropped rows are surfaced, not lost)', () => {
  it('returns a dropped entity-required row instead of silently discarding it', () => {
    const droppable = matched({ transactionType: 'purchase', entity: { matchType: 'exact' } });
    const { confirmed, dropped } = partitionConfirmable([droppable]);

    expect(confirmed).toHaveLength(0);
    expect(dropped).toEqual([droppable]);
  });

  it('treats an unset transaction type with no entity as droppable (requiresEntity default)', () => {
    const untyped = matched({ transactionType: undefined, entity: { matchType: 'none' } });
    const { confirmed, dropped } = partitionConfirmable([untyped]);

    expect(confirmed).toHaveLength(0);
    expect(dropped).toEqual([untyped]);
  });

  it('keeps entity-optional and entity-resolved rows confirmed, dropped empty', () => {
    const withEntity = matched({ checksum: 'a' });
    const transfer = matched({
      checksum: 'b',
      transactionType: 'transfer',
      entity: { matchType: 'none' },
    });
    const reversal = matched({
      checksum: 'c',
      transactionType: 'reversal',
      entity: { matchType: 'none' },
    });
    const { confirmed, dropped } = partitionConfirmable([withEntity, transfer, reversal]);

    expect(confirmed).toEqual([withEntity, transfer, reversal]);
    expect(dropped).toHaveLength(0);
  });

  it('partition is disjoint and exhaustive over the input, and confirmed matches the commit filter', () => {
    const rows = [
      matched({ checksum: 'a' }),
      matched({ checksum: 'b', transactionType: 'purchase', entity: { matchType: 'exact' } }),
      matched({ checksum: 'c', transactionType: 'loan', entity: { matchType: 'none' } }),
      matched({ checksum: 'd', transactionType: 'refund', entity: { matchType: 'none' } }),
    ];
    const { confirmed, dropped } = partitionConfirmable(rows);

    expect(confirmed.length + dropped.length).toBe(rows.length);
    expect(confirmed.every(isConfirmable)).toBe(true);
    expect(dropped.every((t) => !isConfirmable(t))).toBe(true);
    // confirmed carries exactly the rows buildConfirmedTransactions would commit.
    expect(confirmed).toHaveLength(buildConfirmedTransactions(rows).length);
  });
});
