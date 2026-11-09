import { calendarDate } from '../trip-calendar/format';
import { isTripDate } from '../trip-route-editing/lodging-periods';
import { visitDateLabel } from '../trip-visit-editor/model';

import type { ArrangementCoverage, ArrangementPolicy, ArrangementRow } from './model';

/** Formats only the arrangement's own explicit dates; route bounds never fill missing dates. */
export function arrangementDateLabel(row: ArrangementRow): string {
  const dates =
    row.source.kind === 'rental'
      ? [row.source.rental.start, row.source.rental.end]
      : [row.source.record.schedule?.start, row.source.record.schedule?.end];
  return shortArrangementDates([
    ...new Set(dates.filter((date): date is string => date !== undefined && date !== '')),
  ]);
}

/** Formats the source's major-unit change cost in its own currency without assuming an absent currency. */
export function arrangementCostLabel(cost: NonNullable<ArrangementPolicy['changeCost']>): string {
  try {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: cost.currency,
      currencyDisplay: 'code',
    }).format(cost.amount);
  } catch {
    return `${cost.amount} ${cost.currency}`;
  }
}

/** Formats source calendar dates compactly, retaining years at boundaries without repeating a shared year. */
export function shortArrangementDates(dates: string[]): string {
  if (!dates.length) return '';
  if (dates.some((date) => !isTripDate(date))) return dates.map(calendarDate).join(' — ');
  const sameYear = dates.every((date) => date.slice(0, 4) === dates[0]?.slice(0, 4));
  return dates
    .map(
      (date, index) =>
        `${visitDateLabel(date)}${!sameYear || index === dates.length - 1 ? ` ${date.slice(0, 4)}` : ''}`
    )
    .join(' — ');
}

/** Formats validated lodging bounds separately from the source location label; transport details stay verbatim. */
export function arrangementCoverageLabel(finding: ArrangementCoverage): string {
  return finding.start && finding.end
    ? `${finding.detail} · ${shortArrangementDates([finding.start, finding.end])}`
    : finding.detail;
}
