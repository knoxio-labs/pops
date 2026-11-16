import { dateLabel } from './model';
import { workspaceTextMatches } from './workspace-projection';

import type { Journey, JourneyLeg } from '../journey/types';
import type { OverviewViewProps } from './types';

export interface WorkspaceJourneyRecord {
  visible: boolean;
  legs: JourneyLeg[] | undefined;
}

interface JourneySearchState {
  filter: NonNullable<OverviewViewProps['workspaceFilter']>;
  query: boolean;
  sourceMatches: boolean;
  props: OverviewViewProps;
}

/** Filter Journey source rows by their recorded details, leg details and confirmed arrangement states. */
export function workspaceJourneyRecord(
  journey: Journey,
  legs: JourneyLeg[] | undefined,
  props: OverviewViewProps
): WorkspaceJourneyRecord {
  const filter = props.workspaceFilter ?? 'everything';
  const query = Boolean(props.workspaceQuery?.trim());
  const sourceMatches = workspaceTextMatches(props, [
    journey.name,
    journey.reference,
    journey.notes,
    props.labels.source('journey', journey.id),
  ]);
  return {
    visible:
      journeyFilterVisible(filter, legs) && journeyMatchesSearch(query, sourceMatches, legs, props),
    legs: selectedJourneyLegs({ filter, query, sourceMatches, props }, legs),
  };
}

function journeyFilterVisible(
  filter: NonNullable<OverviewViewProps['workspaceFilter']>,
  legs: JourneyLeg[] | undefined
): boolean {
  if (filter === 'needs-attention') return false;
  if (filter !== 'booked' || !legs) return true;
  return legs.some(legConfirmed);
}

function journeyMatchesSearch(
  query: boolean,
  sourceMatches: boolean,
  legs: JourneyLeg[] | undefined,
  props: OverviewViewProps
): boolean {
  if (!query || sourceMatches || !legs) return true;
  return legs.some((leg) => workspaceTextMatches(props, journeyLegText(leg, props)));
}

function selectedJourneyLegs(
  state: JourneySearchState,
  legs: JourneyLeg[] | undefined
): JourneyLeg[] | undefined {
  if (!legs) return undefined;
  if (state.filter === 'booked') return legs.filter(legConfirmed);
  if (state.query && !state.sourceMatches)
    return legs.filter((leg) =>
      workspaceTextMatches(state.props, journeyLegText(leg, state.props))
    );
  return legs;
}

/** Format an endpoint using only its explicit label, source place, local date and timezone. */
export function journeyEndpoint(source: JourneyLeg['from'], props: OverviewViewProps): string {
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

function legConfirmed(leg: JourneyLeg): boolean {
  return (
    leg.purchase === 'Purchased' || leg.arrangement === 'Booked' || leg.arrangement === 'Agreed'
  );
}

function journeyLegText(leg: JourneyLeg, props: OverviewViewProps): (string | null | undefined)[] {
  return [
    leg.mode,
    leg.operator,
    leg.service,
    leg.intention,
    leg.arrangement,
    leg.purchase,
    leg.from.sourceLabel,
    leg.from.date,
    leg.from.local,
    leg.from.timeZone,
    leg.from.placeId === undefined
      ? undefined
      : props.sources.places?.find((place) => place.id === leg.from.placeId)?.name,
    leg.to.sourceLabel,
    leg.to.date,
    leg.to.local,
    leg.to.timeZone,
    leg.to.placeId === undefined
      ? undefined
      : props.sources.places?.find((place) => place.id === leg.to.placeId)?.name,
    journeyEndpoint(leg.from, props),
    journeyEndpoint(leg.to, props),
    props.labels.source('leg', leg.id),
  ];
}
