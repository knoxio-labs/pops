import { Route } from 'lucide-react';

import { Button } from '@pops/ui';

import type { JSX } from 'react';

import type { TripReadiness } from './readiness';
import type { OverviewViewProps } from './types';

/** Shows unresolved nights and exact route gaps for the selected Trip. */
export function OverviewReadinessIssues(
  props: OverviewViewProps & { readiness: TripReadiness }
): JSX.Element {
  const { labels, readiness } = props;
  return (
    <ul className="space-y-3 text-sm">
      {readiness.openNights > 0 && (
        <ReadinessCountIssue
          count={readiness.openNights}
          label={labels.sleepPlan.openNights(readiness.openNights)}
          tone="warning"
        />
      )}
      <RouteGapIssues {...props} />
      {readiness.undatedStops > 0 && (
        <ReadinessCountIssue
          count={readiness.undatedStops}
          label={labels.sleepPlan.datesUndecided}
          tone="muted"
        />
      )}
      {readiness.unverifiedStops > 0 && (
        <ReadinessCountIssue
          count={readiness.unverifiedStops}
          label={labels.sleepPlan.unverified(readiness.unverifiedStops)}
          tone="muted"
        />
      )}
      {readiness.overlappingStops > 0 && (
        <ReadinessCountIssue
          count={readiness.overlappingStops}
          label={labels.sleepPlan.overlap}
          tone="destructive"
        />
      )}
    </ul>
  );
}

function RouteGapIssues(props: OverviewViewProps & { readiness: TripReadiness }): JSX.Element[] {
  return props.readiness.routeGaps.map((id) => (
    <li className="flex gap-3" key={id}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Route className="size-4" aria-hidden />
      </span>
      {props.onOpenPlacement ? (
        <Button
          variant="link"
          className="h-auto min-h-7 justify-start whitespace-normal p-0 text-left"
          onClick={() => props.onOpenPlacement?.({ kind: 'gap', id })}
        >
          {props.labels.sleepPlan.reviewGap(props.labels.source('gap', id))}
        </Button>
      ) : (
        <span>{props.labels.source('gap', id)}</span>
      )}
    </li>
  ));
}

function ReadinessCountIssue({
  count,
  label,
  tone,
}: {
  count: number;
  label: string;
  tone: 'warning' | 'muted' | 'destructive';
}): JSX.Element {
  const toneClass = {
    warning: 'bg-warning/10 text-warning-foreground',
    muted: 'bg-muted text-muted-foreground',
    destructive: 'bg-destructive/10 text-destructive',
  }[tone];
  return (
    <li className="flex gap-3">
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${toneClass}`}
      >
        {count}
      </span>
      <span>{label}</span>
    </li>
  );
}
