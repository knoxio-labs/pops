import { cn } from '@pops/ui';

import { dateRange } from './model';
import { isDatedPeriod } from './workspace-coverage-model';
import { calendarDaysBetween } from './workspace-date';

import type { JSX } from 'react';

import type { AccommodationCoverage } from '../visit/coverage';
import type { OverviewViewProps } from './types';
import type { CoverageRecord, CoverageScale } from './workspace-coverage-model';

/** Show localized month labels aligned to the trip's source-backed coverage date axis. */
export function CoverageMonthAxis({ scale }: { scale: CoverageScale }): JSX.Element {
  return (
    <ol
      aria-label={`${scale.months[0]?.label ?? ''} – ${scale.months.at(-1)?.label ?? ''}`}
      className="flex min-w-0 gap-px text-xs text-trip-muted"
    >
      {scale.months.map((month) => (
        <li
          key={month.label}
          className="min-w-0 flex-1 truncate border-l border-trip-line pl-1"
          style={{ flexGrow: month.days, flexBasis: 0 }}
        >
          {month.label}
        </li>
      ))}
    </ol>
  );
}

/** Render each Visit's coverage spans against a shared date scale. */
export function CoverageTrack(
  props: OverviewViewProps & { record: CoverageRecord; scale: CoverageScale; title: string }
): JSX.Element {
  const intervals = props.record.coverage.periods.filter(isDatedPeriod);
  const accessibleText = intervals.length
    ? intervals
        .map(
          (period) =>
            `${dateRange(period.arrival, period.departure, props.locale)} · ${coverageLabel(period.coverage.state, props.labels)}`
        )
        .join(' · ')
    : props.labels.sleepPlan.datesUndecided;
  return (
    <span
      role="img"
      aria-label={`${props.title} · ${accessibleText}`}
      className={cn(
        'relative block h-2 overflow-hidden rounded-full border border-trip-line bg-trip-canvas',
        intervals.length === 0 && 'border-dashed'
      )}
    >
      {intervals.map((period) => (
        <span
          key={`${period.arrival}:${period.departure}`}
          className={cn('absolute inset-y-0', coverageTrackTone(period.coverage.state))}
          style={{
            left: `${(calendarDaysBetween(props.scale.start, period.arrival) / props.scale.days) * 100}%`,
            width: `${(calendarDaysBetween(period.arrival, period.departure) / props.scale.days) * 100}%`,
          }}
        />
      ))}
    </span>
  );
}

/** Explain the colors and uncertain spans used in the sleep coverage chart. */
export function CoverageLegend(
  props: OverviewViewProps & { records: CoverageRecord[] }
): JSX.Element | null {
  const states = [
    ...new Set(
      props.records.flatMap((record) =>
        record.coverage.periods.map((period) => period.coverage.state)
      )
    ),
  ];
  if (!states.length) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-trip-muted">
      {states.map((state) => (
        <li key={state} className="flex items-center gap-1.5">
          <span aria-hidden className={cn('size-2.5 rounded-sm', coverageTrackTone(state))} />
          {coverageLabel(state, props.labels)}
        </li>
      ))}
    </ul>
  );
}

function coverageLabel(
  state: AccommodationCoverage['state'],
  labels: OverviewViewProps['labels']
): string {
  if (state === 'covered') return labels.sleepPlan.covered;
  if (state === 'missing') return labels.sleepPlan.open;
  return labels.sleepPlan.unknown;
}

function coverageTrackTone(state: AccommodationCoverage['state']): string {
  if (state === 'covered') return 'bg-trip-stay';
  if (state === 'missing') return 'bg-trip-attention';
  return 'border-y border-dashed border-trip-line bg-trip-sunken';
}
