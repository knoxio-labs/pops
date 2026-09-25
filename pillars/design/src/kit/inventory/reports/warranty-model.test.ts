import { at, item } from '@/fixtures/inventory/core-factory';
import { describe, expect, it } from 'vitest';

import { daysLabel, daysUntil, tierCounts, tierOf, warrantyRows } from './warranty-model';

import type { ReportEntry } from './report-model';

const now = new Date(2026, 8, 25, 23, 30);

const entry = (id: string, warrantyExpires: string | null): ReportEntry => ({
  item: item([id, id, null], at('loc-house')),
  provenance: {
    itemId: id,
    replacementValue: 1,
    purchasePrice: 1,
    purchasedOn: null,
    merchant: null,
    warrantyExpires,
    receiptId: null,
    photos: 0,
  },
});

describe('daysUntil', () => {
  it('counts calendar days whatever the hour', () => {
    expect(daysUntil('2026-09-25', now)).toBe(0);
    expect(daysUntil('2026-09-26', now)).toBe(1);
    expect(daysUntil('2026-09-24', now)).toBe(-1);
    expect(daysUntil('2027-09-25', now)).toBe(365);
  });

  it('rejects dates that are not real days', () => {
    expect(daysUntil('2026-02-30', now)).toBeNull();
    expect(daysUntil('26-09-25', now)).toBeNull();
    expect(daysUntil('', now)).toBeNull();
  });
});

describe('tierOf', () => {
  it('draws the boundaries at 0, 30 and 90 days', () => {
    expect([-1, 0, 30, 31, 90, 91].map(tierOf)).toEqual([
      'expired',
      'soon',
      'soon',
      'quarter',
      'quarter',
      'later',
    ]);
  });
});

describe('warrantyRows', () => {
  const rows = warrantyRows(
    [
      entry('later', '2027-06-01'),
      entry('none', null),
      entry('bad', '2026-13-01'),
      entry('lapsed-long', '2026-02-20'),
      entry('soon', '2026-10-04'),
      entry('lapsed-recent', '2026-09-15'),
      entry('today', '2026-09-25'),
    ],
    now
  );

  it('drops entries with no or unreadable dates', () => {
    expect(rows.map((row) => row.entry.item.id)).not.toContain('none');
    expect(rows.map((row) => row.entry.item.id)).not.toContain('bad');
  });

  it('puts live warranties soonest first, then the most recently expired', () => {
    expect(rows.map((row) => row.entry.item.id)).toEqual([
      'today',
      'soon',
      'later',
      'lapsed-recent',
      'lapsed-long',
    ]);
  });

  it('counts each tier', () => {
    expect(tierCounts(rows)).toEqual({ soon: 2, quarter: 0, later: 1, expired: 2 });
  });
});

describe('daysLabel', () => {
  it('reads literally in both directions', () => {
    expect([0, 1, -1, 9, -10].map(daysLabel)).toEqual([
      'Today',
      'Tomorrow',
      'Yesterday',
      'In 9 days',
      '10 days ago',
    ]);
  });
});
