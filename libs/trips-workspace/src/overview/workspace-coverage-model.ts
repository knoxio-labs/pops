import { accommodationCoverage } from '../visit/coverage';
import { validDate } from '../visit/periods';
import { calendarDaysBetween } from './workspace-date';

import type { Visit } from '../stay/types';
import type { OverviewViewProps } from './types';

/** A Visit and its independently sourced accommodation coverage periods. */
export interface CoverageRecord {
  visit: Visit;
  coverage: ReturnType<typeof accommodationCoverage>;
}

/** Counted overnight coverage and Visits whose dates or source reads remain uncertain. */
export interface CoverageTotals {
  covered: number;
  open: number;
  unknownVisits: number;
}

/** Calendar bounds used to position coverage periods on the same date axis. */
export interface CoverageScale {
  start: string;
  end: string;
  days: number;
  months: CoverageMonth[];
}

interface CoverageMonth {
  label: string;
  days: number;
}

/** Classify each Visit with the independently loaded Stay and event collections. */
export function coverageRecords(visits: Visit[], props: OverviewViewProps): CoverageRecord[] {
  const stays = (props.sources.stays ?? []).filter((stay) => stay.tripId === props.tripId);
  const events = (props.sources.events ?? []).filter((event) => event.tripId === props.tripId);
  return visits.map((visit) => ({
    visit,
    coverage: accommodationCoverage(visit, stays, events, props.accommodationComplete),
  }));
}

/** Count only dated and classified nights; never turn uncertain periods into open nights. */
export function coverageTotals(records: CoverageRecord[]): CoverageTotals {
  return records.reduce(
    (total, { coverage }) => {
      for (const period of coverage.periods) {
        const nights = calendarDaysBetween(period.arrival, period.departure);
        if (period.coverage.state === 'covered') total.covered += nights;
        if (period.coverage.state === 'missing') total.open += nights;
      }
      if (!coverage.coverageKnown) total.unknownVisits += 1;
      return total;
    },
    { covered: 0, open: 0, unknownVisits: 0 }
  );
}

/** Build a date scale only from source-backed coverage periods with valid bounds. */
export function coverageScale(
  records: CoverageRecord[],
  locale: string
): CoverageScale | undefined {
  const periods = records.flatMap(({ coverage }) => coverage.periods).filter(isDatedPeriod);
  if (!periods.length) return undefined;
  const start = periods.map((period) => period.arrival).toSorted()[0];
  const end = periods
    .map((period) => period.departure)
    .toSorted()
    .at(-1);
  if (!start || !end) return undefined;
  const days = calendarDaysBetween(start, end);
  return { start, end, days, months: coverageMonths(start, end, locale) };
}

/** Accept only complete, checkout-exclusive source date intervals for the visual scale. */
export function isDatedPeriod(period: { arrival: string; departure: string }): boolean {
  return (
    validDate(period.arrival) && validDate(period.departure) && period.departure > period.arrival
  );
}

function coverageMonths(start: string, end: string, locale: string): CoverageMonth[] {
  const cursor = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  const months: CoverageMonth[] = [];
  while (cursor.getTime() < endTime) {
    const monthStart = cursor.toISOString().slice(0, 10);
    const next = new Date(cursor);
    next.setUTCMonth(cursor.getUTCMonth() + 1, 1);
    const nextMonth = next.getTime() > endTime ? end : next.toISOString().slice(0, 10);
    const clippedStart = monthStart < start ? start : monthStart;
    const clippedEnd = nextMonth > end ? end : nextMonth;
    const days = calendarDaysBetween(clippedStart, clippedEnd);
    if (days > 0) {
      months.push({
        label: new Intl.DateTimeFormat(locale, {
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(cursor),
        days,
      });
    }
    cursor.setTime(next.getTime());
  }
  return months;
}
