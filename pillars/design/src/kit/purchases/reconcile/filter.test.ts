import { describe, expect, it } from 'vitest';

import { filterQueueEntries } from './filter';

import type { QueueEntry } from '@/fixtures/purchases-queue';

function entry(overrides: Partial<QueueEntry> & Pick<QueueEntry, 'chargeId'>): QueueEntry {
  return {
    purchaseId: overrides.chargeId,
    source: 'manual',
    sourceOrderId: null,
    merchantEntityName: 'Merchant',
    orderedAt: '2026-01-01',
    amountCents: 1_000,
    currency: 'AUD',
    deltaCents: 0,
    proposed: [],
    autoLinkedSource: false,
    ...overrides,
  };
}

describe('filterQueueEntries', () => {
  const proposed = entry({
    chargeId: 'proposed',
    proposed: [{ transactionUri: 't1', amountCents: 1_000, linkType: 'exact', confidence: 1 }],
  });
  const unexplained = entry({ chargeId: 'unexplained', proposed: [] });
  const auto = entry({ chargeId: 'auto', autoLinkedSource: true, proposed: [] });

  it('keeps everything under "all" except auto-linked sources', () => {
    const result = filterQueueEntries([proposed, unexplained, auto], {
      kind: 'all',
      includeAuto: false,
    });
    expect(result).toEqual([proposed, unexplained]);
  });

  it('reveals auto-linked sources only when includeAuto is on', () => {
    const result = filterQueueEntries([auto], { kind: 'all', includeAuto: true });
    expect(result).toEqual([auto]);
  });

  it('narrows to charges with at least one proposal under "proposed"', () => {
    const result = filterQueueEntries([proposed, unexplained], {
      kind: 'proposed',
      includeAuto: false,
    });
    expect(result).toEqual([proposed]);
  });

  it('narrows to charges with no proposal under "unexplained"', () => {
    const result = filterQueueEntries([proposed, unexplained], {
      kind: 'unexplained',
      includeAuto: false,
    });
    expect(result).toEqual([unexplained]);
  });

  it('treats an empty entry set as an empty result, not an error', () => {
    expect(filterQueueEntries([], { kind: 'all', includeAuto: true })).toEqual([]);
  });
});
