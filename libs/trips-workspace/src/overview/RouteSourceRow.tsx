import { JourneyRecord } from './OverviewJourneys';
import { OverviewVisit } from './OverviewVisit';
import { resolvedJourney, resolvedVisit } from './route-context';
import { sourceAction } from './source-action';
import { SourceCard } from './SourceCard';
import { VisitFacts } from './VisitFacts';

import type { JSX } from 'react';

import type { ProjectedRouteSource } from '../route/projection';
import type { OverviewViewProps } from './types';

/** Render the shared projector's exact source/availability DTO without reconstructing membership. */
export function RouteSourceRow(
  props: OverviewViewProps & { item: ProjectedRouteSource; historical?: boolean }
): JSX.Element {
  const { item } = props;
  if (!props.historical && resolvedVisit(item))
    return <OverviewVisit {...props} visit={item.source} />;
  if (!props.historical && resolvedJourney(item))
    return (
      <li
        data-route-kind="journey"
        data-route-id={item.reference.id}
        data-route-state={item.state}
        className="min-w-0 pb-5"
      >
        <JourneyRecord {...props} journey={item.source} />
      </li>
    );
  const title = props.labels.source(item.reference.kind, item.reference.id);
  const status = referenceStatus(item, props);
  return (
    <li
      data-route-kind={item.reference.kind}
      data-route-id={item.reference.id}
      data-route-state={item.state}
      className="min-w-0 space-y-2 pb-5"
    >
      <SourceCard
        kind={item.reference.kind}
        title={status ? `${title} · ${status}` : title}
        {...sourceAction(props, item.reference)}
        labels={props.labels}
      />
      {!props.historical && item.reference.kind === 'visit' && (
        <VisitFacts {...props} visitId={item.reference.id} />
      )}
    </li>
  );
}

function referenceStatus(item: ProjectedRouteSource, props: OverviewViewProps): string | undefined {
  if (item.state === 'missing') return props.labels.status('missing');
  return item.state === 'unavailable' ? props.labels.unavailable : undefined;
}
