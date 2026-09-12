import { describe, expect, it } from 'vitest';

import { categorizeWarranties, daysUntil } from './categorize';

import type { WarrantyItem } from './types';

const NOW = new Date(2026, 8, 12); // 2026-09-12, matches "today" for these fixtures

function item(overrides: Partial<WarrantyItem> = {}): WarrantyItem {
  return {
    id: 'itm-1',
    itemName: 'Item',
    assetId: null,
    brand: null,
    model: null,
    warrantyExpires: null,
    replacementValue: null,
    warrantyDocumentId: null,
    ...overrides,
  };
}

describe('daysUntil', () => {
  it('is 0 for today and 1 for tomorrow', () => {
    expect(daysUntil('2026-09-12', NOW)).toBe(0);
    expect(daysUntil('2026-09-13', NOW)).toBe(1);
  });

  it('is negative for a past date', () => {
    expect(daysUntil('2026-09-01', NOW)).toBe(-11);
  });

  it('is NaN for a malformed or out-of-range date', () => {
    expect(daysUntil('not-a-date', NOW)).toBeNaN();
    expect(daysUntil('2026-02-30', NOW)).toBeNaN();
  });

  it('does not mutate the now it is given', () => {
    const now = new Date(2026, 8, 12, 15, 30);
    daysUntil('2026-09-13', now);
    expect(now.getHours()).toBe(15);
    expect(now.getMinutes()).toBe(30);
  });
});

describe('categorizeWarranties', () => {
  it('drops items with no warrantyExpires', () => {
    const tiers = categorizeWarranties([item({ warrantyExpires: null })], NOW);
    expect(tiers.critical).toHaveLength(0);
    expect(tiers.warning).toHaveLength(0);
    expect(tiers.caution).toHaveLength(0);
    expect(tiers.active).toHaveLength(0);
    expect(tiers.expired).toHaveLength(0);
  });

  it('drops items with an unparseable warrantyExpires', () => {
    const tiers = categorizeWarranties([item({ warrantyExpires: 'garbage' })], NOW);
    expect(Object.values(tiers).every((t) => t.length === 0)).toBe(true);
  });

  it('puts a warranty expiring exactly today in critical, not expired', () => {
    const tiers = categorizeWarranties([item({ id: 'a', warrantyExpires: '2026-09-12' })], NOW);
    expect(tiers.expired).toHaveLength(0);
    expect(tiers.critical.map((e) => e.id)).toEqual(['a']);
  });

  it('holds the tier boundaries at 30, 60 and 90 days', () => {
    const at = (days: number, id: string): WarrantyItem => {
      const d = new Date(NOW);
      d.setDate(d.getDate() + days);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
      return item({ id, warrantyExpires: iso });
    };

    const tiers = categorizeWarranties(
      [
        at(29, 'critical'),
        at(30, 'warning'),
        at(59, 'warning-hi'),
        at(60, 'caution'),
        at(90, 'caution-hi'),
        at(91, 'active'),
      ],
      NOW
    );
    expect(tiers.critical.map((e) => e.id)).toEqual(['critical']);
    expect(tiers.warning.map((e) => e.id)).toEqual(['warning', 'warning-hi']);
    expect(tiers.caution.map((e) => e.id)).toEqual(['caution', 'caution-hi']);
    expect(tiers.active.map((e) => e.id)).toEqual(['active']);
  });

  it('sorts expiring tiers soonest first and expired most-recently-lapsed first', () => {
    const tiers = categorizeWarranties(
      [
        item({ id: 'far', warrantyExpires: '2026-09-05' }),
        item({ id: 'near', warrantyExpires: '2026-09-10' }),
        item({ id: 'soon', warrantyExpires: '2026-10-01' }),
        item({ id: 'later', warrantyExpires: '2026-10-05' }),
      ],
      NOW
    );
    expect(tiers.expired.map((e) => e.id)).toEqual(['near', 'far']);
    expect(tiers.critical.map((e) => e.id)).toEqual(['soon', 'later']);
  });
});
