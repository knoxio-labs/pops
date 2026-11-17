import { cn } from '@pops/ui';

import { dateRange } from './model';
import { sourceAction } from './source-action';
import { CoverageLegend, CoverageMonthAxis, CoverageTrack } from './WorkspaceCoverageChart';

import type { JSX } from 'react';

import type { AccommodationCoverage } from '../visit/coverage';
import type { OverviewViewProps } from './types';
import type { CoverageRecord, CoverageScale } from './workspace-coverage-model';

type CoverageInterval = {
  arrival: string;
  departure: string;
  state: AccommodationCoverage['state'];
};

/** Compose the date axis, visit spans and uncertainty legend for the overnight plan. */
export function WorkspaceCoverageTimeline(
  props: OverviewViewProps & { records: CoverageRecord[]; scale: CoverageScale | undefined }
): JSX.Element {
  return (
    <div className="space-y-2">
      {props.scale && <CoverageMonthAxis scale={props.scale} />}
      <div className="space-y-2">
        {props.records.map((record) => (
          <CoverageVisit key={record.visit.id} {...props} record={record} />
        ))}
      </div>
      {props.scale && <CoverageLegend {...props} records={props.records} />}
    </div>
  );
}

function CoverageVisit(
  props: OverviewViewProps & { record: CoverageRecord; scale: CoverageScale | undefined }
): JSX.Element {
  const { visit, coverage } = props.record;
  const action = sourceAction(props, { kind: 'visit', id: visit.id });
  const title =
    props.sources.places?.find((place) => place.id === visit.placeId)?.name ??
    props.labels.source('visit', visit.id);
  const intervals = coverage.periods.map((period) => ({
    arrival: period.arrival,
    departure: period.departure,
    state: period.coverage.state,
  }));
  const descriptions = intervals.map((interval) =>
    intervalDescription(interval, props.labels, props.locale)
  );
  const rowLabel = `${title} · ${descriptions.length ? descriptions.join(' · ') : props.labels.sleepPlan.datesUndecided}`;
  const className =
    'min-h-11 w-full space-y-1 rounded-lg px-2 py-1 text-left hover:bg-trip-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trip-transport';
  const contents = (
    <>
      <span className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 truncate text-sm font-medium">{title}</span>
        <CoveragePeriodLabels {...props} intervals={intervals} />
      </span>
      {props.scale && (
        <CoverageTrack {...props} record={props.record} scale={props.scale} title={title} />
      )}
    </>
  );
  return action.onOpen ? (
    <button aria-label={rowLabel} className={className} onClick={action.onOpen} type="button">
      {contents}
    </button>
  ) : (
    <div className={className}>{contents}</div>
  );
}

function CoveragePeriodLabels(
  props: OverviewViewProps & { intervals: CoverageInterval[] }
): JSX.Element {
  return (
    <span className="flex min-w-0 flex-wrap gap-1.5 text-xs">
      {props.intervals.length ? (
        props.intervals.map((interval) => (
          <span
            key={`${interval.arrival}:${interval.departure}`}
            className={cn('rounded-md px-1.5 py-0.5', coverageLabelTone(interval.state))}
          >
            {dateRange(interval.arrival, interval.departure, props.locale)} ·{' '}
            {coverageLabel(interval.state, props.labels)}
          </span>
        ))
      ) : (
        <span className="text-trip-muted">{props.labels.sleepPlan.datesUndecided}</span>
      )}
    </span>
  );
}

function intervalDescription(
  interval: CoverageInterval,
  labels: OverviewViewProps['labels'],
  locale: string
): string {
  return `${dateRange(interval.arrival, interval.departure, locale)} · ${coverageLabel(interval.state, labels)}`;
}

function coverageLabel(
  state: AccommodationCoverage['state'],
  labels: OverviewViewProps['labels']
): string {
  if (state === 'covered') return labels.sleepPlan.covered;
  if (state === 'missing') return labels.sleepPlan.open;
  return labels.sleepPlan.unknown;
}

function coverageLabelTone(state: AccommodationCoverage['state']): string {
  if (state === 'covered') return 'bg-trip-stay-soft text-trip-stay';
  if (state === 'missing') return 'bg-trip-attention-soft text-trip-attention';
  return 'bg-trip-sunken text-trip-muted';
}
