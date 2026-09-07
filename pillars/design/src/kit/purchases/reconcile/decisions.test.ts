import { describe, expect, it } from 'vitest';

import { applyQueueDecision } from './decisions';

import type { QueueEntry } from '@/fixtures/purchases-queue';

function entry(overrides: Partial<QueueEntry> & Pick<QueueEntry, 'chargeId'>): QueueEntry {
  return {
    purchaseId: overrides.chargeId,
    source: 'manual',
    sourceOrderId: null,
    merchantEntityName: null,
    orderedAt: '2026-01-01',
    amountCents: 1_000,
    currency: 'AUD',
    deltaCents: 0,
    proposed: [{ transactionUri: 't1', amountCents: 1_000, linkType: 'exact', confidence: 1 }],
    autoLinkedSource: false,
    ...overrides,
  };
}

describe('applyQueueDecision', () => {
  it('drops the accepted charge from the queue', () => {
    const entries = [entry({ chargeId: 'a' }), entry({ chargeId: 'b' })];
    expect(applyQueueDecision(entries, 'a', 'accept').map((e) => e.chargeId)).toEqual(['b']);
  });

  it('clears a rejected charge back to unexplained rather than dropping it', () => {
    const entries = [entry({ chargeId: 'a' })];
    const [result] = applyQueueDecision(entries, 'a', 'reject');
    expect(result?.proposed).toEqual([]);
    expect(result?.deltaCents).toBe(-1_000);
  });

  it('leaves every other charge untouched', () => {
    const untouched = entry({ chargeId: 'b' });
    const entries = [entry({ chargeId: 'a' }), untouched];
    const result = applyQueueDecision(entries, 'a', 'reject');
    expect(result.find((e) => e.chargeId === 'b')).toEqual(untouched);
  });

  it('is a no-op when the charge is not in the list', () => {
    const entries = [entry({ chargeId: 'a' })];
    expect(applyQueueDecision(entries, 'missing', 'accept')).toEqual(entries);
  });
});
