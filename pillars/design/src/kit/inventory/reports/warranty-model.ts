/**
 * Warranties by how soon they run out. Days are calendar days from the
 * report's day, so today is 0 and tomorrow is 1 whatever the hour. A date
 * that is not a real `YYYY-MM-DD` day is treated as no warranty at all.
 */
import type { ReportEntry } from './report-model';

/** How soon a warranty ends. */
export type WarrantyTier = 'soon' | 'quarter' | 'later' | 'expired';

/** Tiers in the order the segments read. */
export const WARRANTY_TIERS: readonly WarrantyTier[] = ['soon', 'quarter', 'later', 'expired'];

/** One warranty row. */
export interface WarrantyRow {
  entry: ReportEntry;
  expires: string;
  days: number;
  tier: WarrantyTier;
}

function calendarDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

/** Calendar days from `now` to a `YYYY-MM-DD` date, or null when it is not a real date. */
export function daysUntil(isoDate: string, now: Date): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(isoDate);
  if (match === null) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const target = new Date(year, month - 1, day);
  if (target.getMonth() !== month - 1 || target.getDate() !== day) return null;
  return calendarDay(target) - calendarDay(now);
}

/** The tier for a day count: under 31 days is soon, under 91 within the quarter. */
export function tierOf(days: number): WarrantyTier {
  if (days < 0) return 'expired';
  if (days <= 30) return 'soon';
  return days <= 90 ? 'quarter' : 'later';
}

/**
 * Every entry with a warranty date, soonest first; expired ones most
 * recently expired first, since a warranty that lapsed last week can still
 * be worth a call.
 */
export function warrantyRows(entries: readonly ReportEntry[], now: Date): WarrantyRow[] {
  const rows = entries.flatMap((entry) => {
    const expires = entry.provenance?.warrantyExpires;
    if (expires == null) return [];
    const days = daysUntil(expires, now);
    return days === null ? [] : [{ entry, expires, days, tier: tierOf(days) }];
  });
  const live = rows.filter((row) => row.tier !== 'expired').toSorted((a, b) => a.days - b.days);
  const lapsed = rows.filter((row) => row.tier === 'expired').toSorted((a, b) => b.days - a.days);
  return [...live, ...lapsed];
}

/** Row counts per tier. */
export function tierCounts(rows: readonly WarrantyRow[]): Record<WarrantyTier, number> {
  const counts: Record<WarrantyTier, number> = { soon: 0, quarter: 0, later: 0, expired: 0 };
  for (const row of rows) counts[row.tier] += 1;
  return counts;
}

/** What a day count reads as: `Today`, `Tomorrow`, `In 9 days`, `3 days ago`. */
export function daysLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `In ${days} days` : `${-days} days ago`;
}
