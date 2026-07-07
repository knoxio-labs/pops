import { describe, expect, it } from 'vitest';

import { buildConfirmedTransactions } from './buildConfirmed';

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
