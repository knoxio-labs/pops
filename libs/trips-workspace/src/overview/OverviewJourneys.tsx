import { unwrap } from '@pops/pillar-sdk/client';
import { Badge, ErrorState } from '@pops/ui';

import { useSourceQuery } from '../shared/use-source-query';
import { requestProblem } from '../stay/api';
import { journeyLegsList } from '../trips-api/sdk.gen';
import { dateLabel } from './model';
import { sourceAction } from './source-action';
import { readOverviewSource } from './source-read';
import { SourceCard } from './SourceCard';

import type { JSX } from 'react';

import type { Journey, JourneyLeg } from '../journey/types';
import type { SourceQuery } from '../shared/use-source-query';
import type { OverviewViewProps } from './types';

/** Historical Journey group references remain distinct from active route placement. */
export function OverviewJourneys(props: OverviewViewProps): JSX.Element | null {
  const groups = props.sources.groups ?? [];
  if (!groups.length) return null;
  return (
    <section aria-label={props.labels.journeys} className="min-w-0 space-y-3">
      <h2 className="border-b pb-2 text-lg font-semibold">{props.labels.journeys}</h2>
      {groups.map((group) => (
        <section
          key={group.id}
          className="min-w-0 space-y-3 border-l-2 border-border pl-3"
          aria-label={props.labels.source('group', group.id)}
        >
          <Badge variant="secondary">{props.labels.current}</Badge>
          <JourneyReference {...props} id={group.currentJourneyId} />
          {group.alternativeJourneyIds.length > 0 && (
            <details>
              <summary className="min-h-11 cursor-pointer py-3 text-sm text-muted-foreground">
                {props.labels.alternatives} ({group.alternativeJourneyIds.length})
              </summary>
              <div className="space-y-3">
                {group.alternativeJourneyIds.map((id) => (
                  <JourneyReference key={id} {...props} id={id} />
                ))}
              </div>
            </details>
          )}
        </section>
      ))}
    </section>
  );
}

function JourneyReference(props: OverviewViewProps & { id: number }): JSX.Element {
  const available = props.sources.journeys?.some(
    (journey) => journey.id === props.id && journey.tripId === props.tripId
  );
  const title = props.labels.source('journey', props.id);
  return (
    <SourceCard
      kind="journey"
      title={
        available || props.sources.journeys === undefined
          ? title
          : `${title} · ${props.labels.unavailable}`
      }
      {...sourceAction(props, { kind: 'journey', id: props.id })}
      labels={props.labels}
    />
  );
}

/** Read one canonical Journey and its actual ordered leg facts without assigning it to a Visit. */
export function JourneyRecord({
  journey,
  ...props
}: OverviewViewProps & { journey: Journey }): JSX.Element | null {
  const legs = useJourneyLegs(props, journey);
  if (legs.ownershipError) return <ErrorState error={legs.ownershipError} />;

  return (
    <div className="min-w-0 space-y-2">
      <SourceCard
        kind="journey"
        title={journey.name ?? props.labels.source('journey', journey.id)}
        {...sourceAction(props, { kind: 'journey', id: journey.id })}
        labels={props.labels}
        documents={props.sources.documents?.filter(
          (document) =>
            document.tripId === props.tripId &&
            document.targetKind === 'journey' &&
            document.targetId === journey.id
        )}
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
          {...sourceAction(props, { kind: 'journey', id: journey.id })}
          title={
            [leg.mode, leg.operator, leg.service].filter(Boolean).join(' · ') ||
            props.labels.source('leg', leg.id)
          }
          when={endpoint(leg.from, props)}
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
      source.local ??
        (source.date === undefined ? undefined : dateLabel(source.date, props.locale)),
      source.timeZone,
    ]
      .filter(Boolean)
      .join(' · ') || '…'
  );
}

function useJourneyLegs(props: OverviewViewProps, journey: Journey): SourceQuery<JourneyLeg[]> {
  return useSourceQuery(
    { ...props, kind: 'overview-journey-legs', sourceId: journey.id },
    (owner) => ({
      queryKey: [
        'trips',
        owner.client.getConfig().baseUrl ?? '/trips-api',
        owner.tripId,
        'journey',
        owner.sourceId,
        'legs',
      ],
      load: () =>
        readOverviewSource(
          owner,
          async () =>
            unwrap(
              await journeyLegsList({
                client: owner.client,
                path: { tripId: owner.tripId, journeyId: owner.sourceId },
              })
            ).legs
        ),
    })
  );
}
