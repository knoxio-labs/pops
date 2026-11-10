import { useQuery } from '@tanstack/react-query';

import { unwrap } from '@pops/pillar-sdk/client';
import { Badge, ErrorState } from '@pops/ui';

import { requestProblem } from '../stay/api';
import { journeyLegsList } from '../trips-api/sdk.gen';
import { journeyRecords } from './model';
import { SourceCard } from './SourceCard';

import type { JSX } from 'react';

import type { Journey, JourneyLeg } from '../journey/types';
import type { OverviewViewProps } from './types';

/** Independent journeys and explicit alternatives remain outside the visit rail until placement has a contract. */
export function OverviewJourneys(props: OverviewViewProps): JSX.Element | null {
  const projection = journeyRecords(props.sources.journeys ?? [], props.sources.groups ?? []);
  if (!projection.groups.length && !projection.independent.length) return null;
  return (
    <section aria-label={props.labels.journeys} className="min-w-0 space-y-3">
      <h2 className="border-b pb-2 text-lg font-semibold">{props.labels.journeys}</h2>
      {projection.groups.map(({ group, current, alternatives }) => (
        <section
          key={group.id}
          className="min-w-0 space-y-3 border-l-2 border-border pl-3"
          aria-label={props.labels.source('group', group.id)}
        >
          <Badge variant="secondary">{props.labels.current}</Badge>
          {current ? (
            <JourneyRecord {...props} journey={current} />
          ) : (
            <MissingJourney {...props} id={group.currentJourneyId} />
          )}
          {alternatives.length > 0 && (
            <details>
              <summary className="min-h-11 cursor-pointer py-3 text-sm text-muted-foreground">
                {props.labels.alternatives} ({alternatives.length})
              </summary>
              <div className="space-y-3">
                {alternatives.map(({ id, journey }) =>
                  journey ? (
                    <JourneyRecord key={id} {...props} journey={journey} />
                  ) : (
                    <MissingJourney key={id} {...props} id={id} />
                  )
                )}
              </div>
            </details>
          )}
        </section>
      ))}
      {projection.independent.map((journey) => (
        <JourneyRecord key={journey.id} {...props} journey={journey} />
      ))}
    </section>
  );
}

function MissingJourney(props: OverviewViewProps & { id: number }): JSX.Element {
  const title = props.labels.source('journey', props.id);
  return (
    <SourceCard
      kind="journey"
      title={
        props.sources.journeys === undefined ? title : `${title} · ${props.labels.unavailable}`
      }
      href={props.href('journey', props.id)}
      labels={props.labels}
    />
  );
}

function JourneyRecord({
  journey,
  ...props
}: OverviewViewProps & { journey: Journey }): JSX.Element | null {
  const origin = props.client?.getConfig().baseUrl ?? '/trips-api';
  const legs = useQuery({
    queryKey: ['trips', origin, props.tripId, 'journey', journey.id, 'legs'],
    queryFn: async () =>
      unwrap(
        await journeyLegsList({
          client: props.client,
          path: { tripId: props.tripId, journeyId: journey.id },
        })
      ).legs,
    retry: false,
  });

  return (
    <div className="min-w-0 space-y-2">
      <SourceCard
        kind="journey"
        title={journey.name ?? props.labels.source('journey', journey.id)}
        href={props.href('journey', journey.id)}
        labels={props.labels}
      />
      {legs.isPending && (
        <p role="status" className="text-xs text-muted-foreground">
          {props.labels.loading}
        </p>
      )}
      {legs.isError && (
        <ErrorState error={requestProblem(legs.error)} onRetry={() => void legs.refetch()} />
      )}
      {legs.data?.map((leg) => (
        <SourceCard
          key={leg.id}
          kind="journey"
          title={
            [leg.mode, leg.operator, leg.service].filter(Boolean).join(' · ') ||
            props.labels.source('leg', leg.id)
          }
          purchased={leg.purchase === 'Purchased'}
          statuses={[leg.intention, leg.arrangement, leg.purchase]}
          labels={props.labels}
        >
          <span className="block">
            {endpoint(leg.from, props)} → {endpoint(leg.to, props)}
          </span>
        </SourceCard>
      ))}
    </div>
  );
}

function endpoint(source: JourneyLeg['from'], props: OverviewViewProps): string {
  return (
    [
      source.sourceLabel ??
        (source.placeId
          ? (props.sources.places?.find((place) => place.id === source.placeId)?.name ??
            props.labels.source('place', source.placeId))
          : undefined),
      source.local,
      source.timeZone,
    ]
      .filter(Boolean)
      .join(' · ') || '…'
  );
}
