import { toCsv } from './report-model.js';

import type { ReportEntry } from '../../inventory-web/useReportEntries.js';

/** How soon a warranty ends. */
export type WarrantyTier = 'soon' | 'quarter' | 'later' | 'expired';

/** Inventory locale keys for the warranty tier headings. */
export const WARRANTY_TIER_LABEL_KEYS = {
  soon: 'section.warrantySoon',
  quarter: 'section.warrantyQuarter',
  later: 'section.warrantyLater',
  expired: 'section.expired',
} satisfies Record<WarrantyTier, string>;

/** The warranty tiers in their display order. */
export const WARRANTY_TIERS: readonly WarrantyTier[] = ['soon', 'quarter', 'later', 'expired'];

/** The empty-state copy for each warranty tier. */
export const WARRANTY_TIER_EMPTY: Readonly<Record<WarrantyTier, string>> = {
  soon: 'No warranty ends in the next 30 days.',
  quarter: 'No warranty ends between 31 and 90 days from now.',
  later: 'No warranty runs longer than 90 days.',
  expired: 'No recorded warranty has ended.',
};

/** One report entry with a valid warranty end date and derived tier. */
export interface WarrantyRow {
  entry: ReportEntry;
  expires: string;
  days: number;
  tier: WarrantyTier;
}

function calendarDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

/** Returns calendar days until a real `YYYY-MM-DD` date, or null for invalid input. */
export function daysUntil(isoDate: string, now: Date): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(isoDate);
  if (match === null) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const target = new Date(0);
  target.setHours(0, 0, 0, 0);
  target.setFullYear(year, month - 1, day);
  if (
    target.getFullYear() !== year ||
    target.getMonth() !== month - 1 ||
    target.getDate() !== day
  ) {
    return null;
  }
  return calendarDay(target) - calendarDay(now);
}

/** Assigns the 0, 30 and 90 day warranty boundaries to their display tier. */
export function tierOf(days: number): WarrantyTier {
  if (days < 0) return 'expired';
  if (days <= 30) return 'soon';
  return days <= 90 ? 'quarter' : 'later';
}

/** Builds warranty rows, with live warranties soonest first and recent expiry first. */
export function warrantyRows(entries: readonly ReportEntry[], now: Date): WarrantyRow[] {
  const rows = entries.flatMap((entry) => {
    const expires = entry.warrantyExpires;
    if (expires === null) return [];
    const days = daysUntil(expires, now);
    return days === null ? [] : [{ entry, expires, days, tier: tierOf(days) }];
  });
  const live = rows.filter((row) => row.tier !== 'expired').toSorted((a, b) => a.days - b.days);
  const expired = rows.filter((row) => row.tier === 'expired').toSorted((a, b) => b.days - a.days);
  return [...live, ...expired];
}

/** Counts warranty rows by tier. */
export function tierCounts(rows: readonly WarrantyRow[]): Record<WarrantyTier, number> {
  const counts: Record<WarrantyTier, number> = { soon: 0, quarter: 0, later: 0, expired: 0 };
  for (const row of rows) counts[row.tier] += 1;
  return counts;
}

/** Formats a calendar-day distance as the literal report copy. */
export function daysLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `In ${days} days` : `${-days} days ago`;
}

/** Serializes the selected warranty rows with one CSV record per displayed row. */
export function warrantiesCsv(rows: readonly WarrantyRow[]): string {
  const header = ['Item', 'Code', 'Room', 'Ends', 'Days', 'Value', 'Receipt'];
  const records = rows.map((row) => {
    const value =
      row.entry.replacementValue === null ? null : row.entry.replacementValue * row.entry.quantity;
    return [
      row.entry.name,
      row.entry.code ?? '',
      row.entry.room.label,
      row.expires,
      daysLabel(row.days),
      value === null ? '' : String(value),
      row.entry.receiptId === null ? '' : String(row.entry.receiptId),
    ];
  });
  return toCsv(header, records);
}
