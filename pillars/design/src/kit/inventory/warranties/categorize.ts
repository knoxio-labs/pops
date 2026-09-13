import type { WarrantyEntry, WarrantyItem } from './types';

/**
 * Calendar days from `now` to `dateStr` (a `YYYY-MM-DD` string), rounded up so
 * "tomorrow" is always 1 and "today" is always 0. `now` defaults to the
 * current time; the screen passes an explicit one so a fixture's tier never
 * drifts as the calendar moves.
 */
export function daysUntil(dateStr: string, now: Date = new Date()): number {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!dateMatch) return Number.NaN;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return Number.NaN;
  }
  const target = new Date(year, month - 1, day);
  if (
    target.getFullYear() !== year ||
    target.getMonth() !== month - 1 ||
    target.getDate() !== day
  ) {
    return Number.NaN;
  }
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function urgencyBadgeVariant(days: number): 'destructive' | 'secondary' | 'outline' {
  if (days <= 14) return 'destructive';
  if (days <= 30) return 'secondary';
  return 'outline';
}

export function formatDaysRemaining(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

export function brandModelLabel(brand: string | null, model: string | null): string | null {
  if (brand && model) return `${brand} ${model}`;
  return brand ?? model ?? null;
}

export interface WarrantyTiers {
  critical: WarrantyEntry[];
  warning: WarrantyEntry[];
  caution: WarrantyEntry[];
  active: WarrantyEntry[];
  expired: WarrantyEntry[];
}

/**
 * Sorts every warranty with an expiry date into one of five tiers relative to
 * `now` (defaulting to the current time): `expired` (past), `critical` (under
 * 30 days), `warning` (30 to 60), `caution` (60 to 90) or `active` (over 90).
 * Items with no `warrantyExpires`, or one that fails to parse, are dropped.
 */
export function categorizeWarranties(items: WarrantyItem[], now: Date = new Date()): WarrantyTiers {
  const tiers: WarrantyTiers = {
    critical: [],
    warning: [],
    caution: [],
    active: [],
    expired: [],
  };

  for (const item of items) {
    if (!item.warrantyExpires) continue;
    const days = daysUntil(item.warrantyExpires, now);
    if (!Number.isFinite(days)) continue;
    const entry: WarrantyEntry = { ...item, daysRemaining: days };
    if (days < 0) tiers.expired.push(entry);
    else if (days < 30) tiers.critical.push(entry);
    else if (days < 60) tiers.warning.push(entry);
    else if (days <= 90) tiers.caution.push(entry);
    else tiers.active.push(entry);
  }

  tiers.critical.sort((a, b) => a.daysRemaining - b.daysRemaining);
  tiers.warning.sort((a, b) => a.daysRemaining - b.daysRemaining);
  tiers.caution.sort((a, b) => a.daysRemaining - b.daysRemaining);
  tiers.active.sort((a, b) => a.daysRemaining - b.daysRemaining);
  tiers.expired.sort((a, b) => b.daysRemaining - a.daysRemaining);
  return tiers;
}
