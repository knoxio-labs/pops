/**
 * Window resolution for the dashboard summary (POPS-3589, POPS-250 decision 1).
 *
 * Separate from `period-window.ts`, which answers a narrower question for
 * budgets (a lower bound for `Monthly`/`Yearly` and nothing else). This module
 * owns both bounds AND the preceding comparison window, which budgets have no
 * notion of.
 *
 * Every bound is an inclusive ISO `YYYY-MM-DD` string, because
 * `transactions.date` is a `YYYY-MM-DD` text column and lexicographic `>=` /
 * `<=` compare correctly against that form.
 *
 * All arithmetic is done on UTC epoch *days*, never by mutating a `Date`'s
 * month. `setUTCMonth(m - 1)` on 2026-03-31 yields 2026-03-03 — February has
 * no 31st, so the overflow rolls forward into the month being compared
 * against. That is the off-by-one this module exists to not have, and
 * `summary-window.test.ts` pins it.
 */

import { type SummaryWindowKey } from '../../contract/summary-windows.js';

/** An inclusive `YYYY-MM-DD` date range. */
export interface DateRange {
  start: string;
  end: string;
}

export interface ResolvedSummaryWindow {
  key: SummaryWindowKey;
  /** Inclusive lower bound; `null` for `all`, which has none. */
  start: string | null;
  /** Inclusive upper bound — always today, never a future date. */
  end: string;
  /**
   * The period this one is compared against, or `null` for `all` — there is
   * nothing before all time, and inventing a zero baseline would render as a
   * +100% change.
   */
  previous: DateRange | null;
}

const MS_PER_DAY = 86_400_000;

function toEpochDay(year: number, monthIndex: number, day: number): number {
  return Date.UTC(year, monthIndex, day) / MS_PER_DAY;
}

function toIsoDate(epochDay: number): string {
  return new Date(epochDay * MS_PER_DAY).toISOString().slice(0, 10);
}

function epochDayOf(now: Date): number {
  return toEpochDay(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** A rolling window of `days` ending today, compared against the `days` before it. */
function rolling(key: SummaryWindowKey, today: number, days: number): ResolvedSummaryWindow {
  const start = today - (days - 1);
  return {
    key,
    start: toIsoDate(start),
    end: toIsoDate(today),
    previous: { start: toIsoDate(start - days), end: toIsoDate(start - 1) },
  };
}

/**
 * A calendar window (month-to-date, year-to-date) against the same calendar
 * unit one step back, truncated to the elapsed length so 12 days of September
 * are not compared against all 31 of August.
 *
 * The truncation is clamped to the previous unit's own last day: a 31-day
 * March-to-date has no 31st of February to reach, so the comparison is 28 days
 * against 31. Both ranges are reported on the wire precisely so a caller can
 * see that asymmetry rather than infer it.
 */
function calendar(
  key: SummaryWindowKey,
  today: number,
  bounds: { currentStart: number; previousStart: number; previousLast: number }
): ResolvedSummaryWindow {
  const { currentStart, previousStart, previousLast } = bounds;
  const elapsed = today - currentStart + 1;
  return {
    key,
    start: toIsoDate(currentStart),
    end: toIsoDate(today),
    previous: {
      start: toIsoDate(previousStart),
      end: toIsoDate(Math.min(previousStart + elapsed - 1, previousLast)),
    },
  };
}

/**
 * Resolve a window key to its bounds and the period it is compared against.
 *
 * `now` is injected rather than read, so the month-boundary cases can be
 * tested at the dates where they break.
 */
export function resolveSummaryWindow(
  key: SummaryWindowKey,
  now: Date = new Date()
): ResolvedSummaryWindow {
  const today = epochDayOf(now);
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();

  if (key === '30d') return rolling(key, today, 30);
  if (key === '90d') return rolling(key, today, 90);
  if (key === 'month') {
    return calendar(key, today, {
      currentStart: toEpochDay(year, monthIndex, 1),
      previousStart: toEpochDay(year, monthIndex - 1, 1),
      // Day 0 of this month is the last day of the previous one.
      previousLast: toEpochDay(year, monthIndex, 0),
    });
  }
  if (key === 'year') {
    return calendar(key, today, {
      currentStart: toEpochDay(year, 0, 1),
      previousStart: toEpochDay(year - 1, 0, 1),
      previousLast: toEpochDay(year - 1, 11, 31),
    });
  }
  return { key, start: null, end: toIsoDate(today), previous: null };
}

/**
 * Every `YYYY-MM` the range covers, oldest first — months with no rows
 * included, so the trend panel draws a gap rather than closing it.
 */
export function monthsInRange(range: DateRange): string[] {
  const months: string[] = [];
  const last = range.end.slice(0, 7);
  let year = Number(range.start.slice(0, 4));
  let monthIndex = Number(range.start.slice(5, 7)) - 1;
  for (let cursor = range.start.slice(0, 7); cursor <= last;) {
    months.push(cursor);
    monthIndex += 1;
    if (monthIndex > 11) {
      monthIndex = 0;
      year += 1;
    }
    cursor = `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}`;
  }
  return months;
}
