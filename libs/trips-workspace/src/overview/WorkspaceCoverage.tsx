import { BedDouble } from 'lucide-react';

import { cn } from '@pops/ui';

import { accommodationCoverage } from '../visit/coverage';
import { dateRange } from './model';
import { sourceAction } from './source-action';

import type { JSX } from 'react';

import type { AccommodationCoverage } from '../visit/coverage';
import type { OverviewViewProps } from './types';

/** Recorded Visit intervals reuse the canonical coverage classifier without assigning dates to unknown visits. */
export function WorkspaceCoverage(props: OverviewViewProps): JSX.Element | null {
  const visits = props.sources.visits?.filter((visit) => visit.tripId === props.tripId);
  if (!visits?.length) return null;
  return (
    <section
      aria-label={props.labels.status('workspace.sleep')}
      className="space-y-3 rounded-2xl border border-trip-line bg-trip-surface p-4"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <BedDouble className="size-4 text-trip-stay" aria-hidden />
        {props.labels.status('workspace.sleep')}
      </h2>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {visits.map((visit) => {
          const coverage = accommodationCoverage(
            visit,
            (props.sources.stays ?? []).filter((stay) => stay.tripId === props.tripId),
            [],
            props.accommodationComplete
          );
          const intervals = coverage.periods.map((period) => period.coverage);
          const action = sourceAction(props, { kind: 'visit', id: visit.id });
          const title =
            props.sources.places?.find((place) => place.id === visit.placeId)?.name ??
            props.labels.source('visit', visit.id);
          const content = (
            <>
              <span className="block font-medium">{title}</span>
              <CoverageIntervals {...props} intervals={intervals} />
            </>
          );
          const className =
            'min-h-11 min-w-40 shrink-0 space-y-2 rounded-xl border border-trip-line bg-trip-surface px-3 py-2 text-left text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
          return action.onOpen ? (
            <button
              key={visit.id}
              aria-label={`${props.labels.status('workspace.sleep')} · ${title}`}
              className={className}
              onClick={action.onOpen}
              type="button"
            >
              {content}
            </button>
          ) : (
            <div key={visit.id} className={className}>
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CoverageIntervals({
  intervals,
  ...props
}: OverviewViewProps & { intervals: AccommodationCoverage[] }): JSX.Element {
  if (!intervals.length)
    return (
      <span className="block text-muted-foreground">
        {props.labels.status('workspace.unjudged')}
      </span>
    );
  return (
    <span className="block space-y-1">
      {intervals.map((interval, index) => (
        <span
          key={
            interval.state === 'unknown'
              ? `unknown:${index}`
              : `${interval.arrival}:${interval.departure}`
          }
          className={cn('block rounded-md border px-2 py-1', coverageTone(interval.state))}
        >
          {interval.state === 'unknown' ? (
            props.labels.status('workspace.unjudged')
          ) : (
            <>
              {dateRange(interval.arrival, interval.departure, props.locale)} ·{' '}
              {props.labels.status(
                interval.state === 'covered' ? 'workspace.covered' : 'workspace.open'
              )}
            </>
          )}
        </span>
      ))}
    </span>
  );
}

function coverageTone(state: AccommodationCoverage['state']): string {
  if (state === 'covered') return 'border-trip-stay/30 bg-trip-stay-soft text-trip-stay';
  if (state === 'missing')
    return 'border-trip-attention/30 bg-trip-attention-soft text-trip-attention';
  return 'border-dashed border-border text-muted-foreground';
}
