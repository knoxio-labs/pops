import { describe, expect, it } from 'vitest';

import { correctionApplicationChanged, transactionChanged } from '../reevaluate-diff.js';

import type { ProcessedTransaction, SuggestedTag } from '../types.js';

function txn(overrides: Partial<ProcessedTransaction> = {}): ProcessedTransaction {
  return {
    date: '2026-02-13',
    description: 'WOOLWORTHS 1234',
    amount: -42.5,
    dialectAccountLabel: 'Amex',
    rawRow: '{}',
    checksum: 'chk-1',
    status: 'matched',
    entity: { entityId: 'ent-1', entityName: 'Woolworths', matchType: 'exact' },
    ...overrides,
  };
}

describe('transactionChanged', () => {
  it('reports unchanged for two identical transactions with no bucket move', () => {
    expect(transactionChanged(txn(), txn())).toBe(false);
  });

  it('reports changed on a bucket move (matched -> uncertain)', () => {
    expect(transactionChanged(txn(), txn(), 'matched', 'uncertain')).toBe(true);
  });

  it('ignores identical buckets even when both are supplied', () => {
    expect(transactionChanged(txn(), txn(), 'matched', 'matched')).toBe(false);
  });

  it('ignores bucket args when only one side is supplied', () => {
    expect(transactionChanged(txn(), txn(), 'matched', undefined)).toBe(false);
  });

  it('reports changed on a status flip', () => {
    expect(transactionChanged(txn({ status: 'matched' }), txn({ status: 'uncertain' }))).toBe(true);
  });

  it('reports changed on a transactionType change', () => {
    expect(
      transactionChanged(txn({ transactionType: 'purchase' }), txn({ transactionType: 'transfer' }))
    ).toBe(true);
  });

  it('reports changed on an entityId change', () => {
    expect(
      transactionChanged(
        txn({ entity: { entityId: 'ent-1', entityName: 'Woolworths', matchType: 'exact' } }),
        txn({ entity: { entityId: 'ent-2', entityName: 'Woolworths', matchType: 'exact' } })
      )
    ).toBe(true);
  });

  it('reports changed on an entityName change (same entityId)', () => {
    expect(
      transactionChanged(
        txn({ entity: { entityId: 'ent-1', entityName: 'Woolworths', matchType: 'exact' } }),
        txn({ entity: { entityId: 'ent-1', entityName: 'Woolies', matchType: 'exact' } })
      )
    ).toBe(true);
  });

  it('reports changed on a matchType change alone', () => {
    expect(
      transactionChanged(
        txn({ entity: { entityId: 'ent-1', entityName: 'Woolworths', matchType: 'exact' } }),
        txn({ entity: { entityId: 'ent-1', entityName: 'Woolworths', matchType: 'learned' } })
      )
    ).toBe(true);
  });

  it('reports unchanged when neither entity has an id or name (both no-match)', () => {
    expect(
      transactionChanged(
        txn({ entity: { matchType: 'none' } }),
        txn({ entity: { matchType: 'none' } })
      )
    ).toBe(false);
  });
});

function tag(name: string): SuggestedTag {
  return { tag: name, source: 'rule' };
}

describe('correctionApplicationChanged (POPS-2659)', () => {
  it('reports unchanged for two identical transactions', () => {
    expect(correctionApplicationChanged(txn(), txn())).toBe(false);
  });

  it('defers to transactionChanged for a classification change', () => {
    expect(
      correctionApplicationChanged(
        txn({ entity: { entityId: 'ent-1', entityName: 'Woolworths', matchType: 'exact' } }),
        txn({ entity: { entityId: 'ent-2', entityName: 'Woolworths', matchType: 'exact' } })
      )
    ).toBe(true);
  });

  it('counts a tag-only rewrite that transactionChanged misses', () => {
    const prev = txn({ suggestedTags: [] });
    const next = txn({ suggestedTags: [tag('venue:supermarket')] });

    expect(transactionChanged(prev, next)).toBe(false);
    expect(correctionApplicationChanged(prev, next)).toBe(true);
  });

  it('counts a location-only rewrite that transactionChanged misses', () => {
    const prev = txn({ location: undefined });
    const next = txn({ location: 'Sydney CBD' });

    expect(transactionChanged(prev, next)).toBe(false);
    expect(correctionApplicationChanged(prev, next)).toBe(true);
  });

  it('counts a location cleared to undefined', () => {
    const prev = txn({ location: 'Sydney CBD' });
    const next = txn({ location: undefined });

    expect(correctionApplicationChanged(prev, next)).toBe(true);
  });

  it('ignores tags reordered but not otherwise changed, matching the tag-rules preview diff (Set, not order)', () => {
    const prev = txn({ suggestedTags: [tag('venue:supermarket'), tag('contains:groceries')] });
    const next = txn({ suggestedTags: [tag('contains:groceries'), tag('venue:supermarket')] });

    expect(correctionApplicationChanged(prev, next)).toBe(false);
  });

  it('reports unchanged when neither side carries any suggested tags', () => {
    expect(
      correctionApplicationChanged(txn({ suggestedTags: undefined }), txn({ suggestedTags: [] }))
    ).toBe(false);
  });
});
