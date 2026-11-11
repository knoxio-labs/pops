import { JourneyRecord } from './OverviewJourneys';
import { OverviewVisit } from './OverviewVisit';

import type { JSX } from 'react';

import type { OverviewViewProps } from './types';

/** Proven unplaced sources use the shared projector; absent route reads keep placement explicitly unresolved. */
export function OverviewUnplaced(props: OverviewViewProps): JSX.Element | null {
  const sources = props.projection?.unplaced ?? {
    visits: props.sources.visits?.filter((visit) => visit.tripId === props.tripId) ?? [],
    journeys: props.sources.journeys?.filter((journey) => journey.tripId === props.tripId) ?? [],
  };
  if (!sources.visits.length && !sources.journeys.length) return null;
  const title = props.projection ? props.labels.status('unplaced') : props.labels.unresolved;
  return (
    <section aria-label={title} className="min-w-0 space-y-3">
      <h2 className="border-b pb-2 text-lg font-semibold">{title}</h2>
      <ul>
        {sources.visits.map((visit) => (
          <OverviewVisit key={visit.id} {...props} visit={visit} />
        ))}
      </ul>
      {sources.journeys.map((journey) => (
        <JourneyRecord key={journey.id} {...props} journey={journey} />
      ))}
    </section>
  );
}
