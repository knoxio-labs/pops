import { BedDouble, CircleAlert, CircleCheck, MapPin } from 'lucide-react';

import { Badge } from '@pops/ui';

import { OverviewReadinessIssues } from './OverviewReadinessIssues';

import type { JSX } from 'react';

import type { SleepCoverageState, TripReadiness } from './readiness';
import type { OverviewViewProps } from './types';

/** Shows checkout-exclusive stay coverage for the exact Visits in the current route. */
export function OverviewSleepPlan(
  props: OverviewViewProps & { readiness: TripReadiness }
): JSX.Element {
  const { labels, readiness } = props;
  return (
    <section
      aria-label={labels.sleepPlan.title}
      className="overflow-hidden rounded-xl border bg-card shadow-sm"
    >
      <SleepPlanHeading {...props} />
      {readiness.stops.length > 0 ? (
        <div className="flex snap-x gap-3 overflow-x-auto p-4 sm:p-5">
          {readiness.stops.map((stop, index) => (
            <SleepStopCard key={stop.id} {...props} stop={stop} index={index} />
          ))}
        </div>
      ) : (
        <p className="p-5 text-sm text-muted-foreground">{labels.sleepPlan.noVisits}</p>
      )}
    </section>
  );
}

function SleepPlanHeading(props: OverviewViewProps & { readiness: TripReadiness }): JSX.Element {
  const { labels, readiness } = props;
  const allCovered =
    readiness.openNights === 0 &&
    readiness.undatedStops === 0 &&
    readiness.unverifiedStops === 0 &&
    readiness.overlappingStops === 0 &&
    readiness.stops.length > 0;
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
          <BedDouble className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold">{labels.sleepPlan.title}</h2>
          <p className="text-xs text-muted-foreground">
            {labels.sleepPlan.stopCount(readiness.stops.length)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" aria-live="polite">
        {readiness.openNights > 0 && (
          <Badge variant="outline" className="border-warning/40 text-warning-foreground">
            {labels.sleepPlan.openNights(readiness.openNights)}
          </Badge>
        )}
        {readiness.undatedStops > 0 && (
          <Badge variant="outline">{labels.sleepPlan.datesUndecided}</Badge>
        )}
        {allCovered && (
          <Badge variant="outline" className="border-success/40 text-success">
            {labels.sleepPlan.covered}
          </Badge>
        )}
      </div>
    </header>
  );
}

function SleepStopCard(
  props: OverviewViewProps & {
    stop: TripReadiness['stops'][number];
    index: number;
  }
): JSX.Element {
  const { labels, stop, index } = props;
  return (
    <article className="min-w-52 max-w-64 flex-1 snap-start rounded-lg border bg-background p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex size-7 items-center justify-center rounded-full bg-app-accent/10 text-xs font-semibold text-app-accent">
          {index + 1}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${stateClass(stop.state)}`}
        >
          <CoverageStateIcon state={stop.state} />
          {stateLabel(stop.state, props)}
        </span>
      </div>
      <h3 className="line-clamp-2 font-medium">{stop.title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {stop.timing || labels.sleepPlan.datesUndecided}
      </p>
      {stop.openNights > 0 && (
        <p className="mt-3 text-xs font-medium text-warning-foreground">
          {labels.sleepPlan.openNights(stop.openNights)}
        </p>
      )}
    </article>
  );
}

function CoverageStateIcon({ state }: { state: SleepCoverageState }): JSX.Element {
  if (state === 'covered') return <CircleCheck className="size-3.5" aria-hidden />;
  if (state === 'open' || state === 'overlap')
    return <CircleAlert className="size-3.5" aria-hidden />;
  return <MapPin className="size-3.5" aria-hidden />;
}

/** Surfaces exact route, coverage and date issues without treating undated Visits as open nights. */
export function OverviewBeforeYouGo(
  props: OverviewViewProps & { readiness: TripReadiness }
): JSX.Element {
  const { labels, readiness } = props;
  const hasIssues =
    readiness.openNights > 0 ||
    readiness.routeGaps.length > 0 ||
    readiness.undatedStops > 0 ||
    readiness.unverifiedStops > 0 ||
    readiness.overlappingStops > 0;
  return (
    <section aria-label={labels.sleepPlan.attention} className="rounded-xl border bg-card p-4">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <CircleAlert className="size-4 text-warning" aria-hidden />
        {labels.sleepPlan.attention}
      </h2>
      {hasIssues ? (
        <OverviewReadinessIssues {...props} />
      ) : (
        <p className="text-sm text-muted-foreground">{labels.sleepPlan.noIssues}</p>
      )}
    </section>
  );
}

function stateClass(state: SleepCoverageState): string {
  switch (state) {
    case 'covered':
      return 'bg-success/10 text-success';
    case 'open':
      return 'bg-warning/10 text-warning-foreground';
    case 'overlap':
      return 'bg-destructive/10 text-destructive';
    case 'unknown':
    case 'undated':
      return 'bg-muted text-muted-foreground';
  }
}

function stateLabel(state: SleepCoverageState, props: OverviewViewProps): string {
  switch (state) {
    case 'covered':
      return props.labels.sleepPlan.covered;
    case 'open':
      return props.labels.sleepPlan.open;
    case 'overlap':
      return props.labels.sleepPlan.overlap;
    case 'unknown':
      return props.labels.sleepPlan.unknown;
    case 'undated':
      return props.labels.sleepPlan.datesUndecided;
  }
}
