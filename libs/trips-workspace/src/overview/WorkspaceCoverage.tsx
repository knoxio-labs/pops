import { BedDouble } from 'lucide-react';

import { Badge, cn } from '@pops/ui';

import { accommodationCoverage } from '../visit/coverage';
import { dateRange } from './model';
import { sourceAction } from './source-action';
import { calendarDaysBetween } from './workspace-date';

import type { JSX } from 'react';

import type { Visit } from '../stay/types';
import type { AccommodationCoverage } from '../visit/coverage';
import type { OverviewViewProps } from './types';

interface CoverageRecord {
  visit: Visit;
  coverage: ReturnType<typeof accommodationCoverage>;
}

interface CoverageTotals {
  covered: number;
  open: number;
  unknownVisits: number;
}

/** Recorded Visit intervals reuse the canonical coverage classifier without assigning dates to unknown visits. */
export function WorkspaceCoverage(props: OverviewViewProps): JSX.Element | null {
  const visits = props.sources.visits?.filter((visit) => visit.tripId === props.tripId);
  if (!visits?.length) return null;
  const records = coverageRecords(visits, props);
  const totals = coverageTotals(records);
  return (
    <section
      aria-label={props.labels.sleepPlan.title}
      className="space-y-3 rounded-2xl border border-trip-line bg-trip-surface p-4"
    >
      <CoverageSummary {...props} totals={totals} />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {records.map((record) => (
          <CoverageVisit key={record.visit.id} {...props} record={record} />
        ))}
      </div>
    </section>
  );
}

function coverageRecords(visits: Visit[], props: OverviewViewProps): CoverageRecord[] {
  const stays = (props.sources.stays ?? []).filter((stay) => stay.tripId === props.tripId);
  const events = (props.sources.events ?? []).filter((event) => event.tripId === props.tripId);
  return visits.map((visit) => ({
    visit,
    coverage: accommodationCoverage(visit, stays, events, props.accommodationComplete),
  }));
}

function coverageTotals(records: CoverageRecord[]): CoverageTotals {
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

function CoverageSummary(props: OverviewViewProps & { totals: CoverageTotals }): JSX.Element {
  const { totals } = props;
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <BedDouble className="size-4 text-trip-stay" aria-hidden />
        {props.labels.sleepPlan.title}
      </h2>
      <div
        role="group"
        className="flex flex-wrap gap-2"
        aria-label={props.labels.status('workspace.summary')}
      >
        {totals.covered > 0 && (
          <Badge className="border-trip-stay/30 bg-trip-stay-soft text-trip-stay">
            {totals.covered} · {props.labels.sleepPlan.covered}
          </Badge>
        )}
        {totals.open > 0 && (
          <Badge className="border-trip-attention/30 bg-trip-attention-soft text-trip-attention">
            {props.labels.sleepPlan.openNights(totals.open)}
          </Badge>
        )}
        {totals.unknownVisits > 0 && (
          <Badge variant="outline" className="border-dashed text-trip-muted">
            {totals.unknownVisits} · {props.labels.sleepPlan.unknown}
          </Badge>
        )}
      </div>
    </div>
  );
}

function CoverageVisit(props: OverviewViewProps & { record: CoverageRecord }): JSX.Element {
  const { visit, coverage } = props.record;
  const intervals = coverage.periods.map((period) => period.coverage);
  const action = sourceAction(props, { kind: 'visit', id: visit.id });
  const title =
    props.sources.places?.find((place) => place.id === visit.placeId)?.name ??
    props.labels.source('visit', visit.id);
  const className =
    'min-h-11 min-w-40 shrink-0 space-y-2 rounded-xl border border-trip-line bg-trip-surface px-3 py-2 text-left text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return action.onOpen ? (
    <button
      aria-label={`${props.labels.sleepPlan.title} · ${title}`}
      className={className}
      onClick={action.onOpen}
      type="button"
    >
      <CoverageVisitContent {...props} title={title} intervals={intervals} />
    </button>
  ) : (
    <div className={className}>
      <CoverageVisitContent {...props} title={title} intervals={intervals} />
    </div>
  );
}

function CoverageVisitContent(
  props: OverviewViewProps & { title: string; intervals: AccommodationCoverage[] }
): JSX.Element {
  return (
    <>
      <span className="block font-medium">{props.title}</span>
      <CoverageIntervals {...props} intervals={props.intervals} />
    </>
  );
}

function CoverageIntervals({
  intervals,
  ...props
}: OverviewViewProps & { intervals: AccommodationCoverage[] }): JSX.Element {
  if (!intervals.length)
    return (
      <span className="block text-muted-foreground">{props.labels.sleepPlan.datesUndecided}</span>
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
            <span>{props.labels.sleepPlan.unknown}</span>
          ) : (
            <>
              <span>{dateRange(interval.arrival, interval.departure, props.locale)}</span>
              <span> · </span>
              {interval.state === 'covered' ? (
                <span>{props.labels.sleepPlan.covered}</span>
              ) : (
                <>
                  <span>{props.labels.sleepPlan.open}</span>
                  <span> · </span>
                  <span>
                    {props.labels.sleepPlan.openNights(
                      calendarDaysBetween(interval.arrival, interval.departure)
                    )}
                  </span>
                </>
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
