import { accommodationCoverage } from '../visit/coverage';
import { contextRecords } from './ContextSources';
import { visitFacts } from './model';
import { resolvedJourney, resolvedVisit } from './route-context';

import type { ProjectedRouteItem } from '../route/projection';
import type { Visit } from '../stay/types';
import type { OverviewContextRecord } from './ContextSources';
import type { OverviewViewProps } from './types';

interface WorkspaceRecordFacts {
  text: (string | null | undefined)[];
  confirmed?: boolean;
  needsAttention?: boolean;
}

/** Match route groups against explicit source text and confirmed arrangement states. */
export function workspaceItemVisible(item: ProjectedRouteItem, props: OverviewViewProps): boolean {
  const filter = props.workspaceFilter ?? 'everything';
  if (resolvedJourney(item)) return filter !== 'needs-attention';
  const needsAttention =
    item.state === 'gap' ||
    item.state === 'missing' ||
    item.state === 'unavailable' ||
    (resolvedVisit(item) && visitNeedsAttention(item.source, props));
  return workspaceRecordVisible(props, {
    text: searchableText(item, props),
    confirmed: resolvedVisit(item) && hasConfirmedArrangement(item, props),
    needsAttention,
  });
}

/** Apply the route's current search and state filter to an unplaced Visit. */
export function workspaceVisitVisible(visit: Visit, props: OverviewViewProps): boolean {
  const item: ProjectedRouteItem = {
    reference: { kind: 'visit', id: visit.id },
    state: 'resolved',
    source: visit,
  };
  return workspaceItemVisible(item, props);
}

/** Search and filter a source using facts explicitly recorded on that source. */
export function workspaceRecordVisible(
  props: OverviewViewProps,
  facts: WorkspaceRecordFacts
): boolean {
  const filter = props.workspaceFilter ?? 'everything';
  if (filter === 'booked' && !facts.confirmed) return false;
  if (filter === 'needs-attention' && !facts.needsAttention) return false;
  return workspaceTextMatches(props, facts.text);
}

/** Match source fields against the trip workspace query without changing record identity. */
export function workspaceTextMatches(
  props: OverviewViewProps,
  text: (string | null | undefined)[]
): boolean {
  const query = props.workspaceQuery?.trim().toLowerCase();
  return !query || text.some((value) => value?.toLowerCase().includes(query));
}

/** Search a detached Journey by its own recorded metadata; its leg state is loaded separately. */
export function workspaceJourneyFilterVisible(props: OverviewViewProps): boolean {
  return (props.workspaceFilter ?? 'everything') !== 'needs-attention';
}

function visitNeedsAttention(visit: Visit, props: OverviewViewProps): boolean {
  const timing = visit.timing;
  if (!timing.arrival || !timing.departure) return true;
  return accommodationCoverage(
    visit,
    props.sources.stays ?? [],
    props.sources.events ?? [],
    props.accommodationComplete
  ).periods.some((period) => period.coverage.state === 'missing');
}

function hasConfirmedArrangement(item: ProjectedRouteItem, props: OverviewViewProps): boolean {
  if (!resolvedVisit(item)) return false;
  const { stays, events } = visitFacts(
    item.source.id,
    (props.sources.stays ?? []).filter((stay) => stay.tripId === props.tripId),
    (props.sources.events ?? []).filter((event) => event.tripId === props.tripId)
  );
  const staysConfirmed = stays.some(
    (stay) => stay.status === 'Agreed' || stay.status === 'Reserved' || stay.status === 'Purchased'
  );
  const eventsConfirmed = events.some(
    (event) =>
      event.purchase === 'Purchased' ||
      event.arrangement === 'Booked' ||
      event.arrangement === 'Agreed'
  );
  const rentalsConfirmed = (props.sources.rentals ?? []).some(
    (rental) =>
      rental.tripId === props.tripId &&
      (rental.pickupVisitId === item.source.id || rental.returnVisitId === item.source.id) &&
      (rental.status === 'Reserved' || rental.status === 'Purchased')
  );
  const meetingsConfirmed = contextRecords(props.sources, props.tripId).some(
    (record) =>
      record.kind === 'meeting' &&
      record.source.visitId === item.source.id &&
      record.source.agreement === 'Agreed'
  );
  return staysConfirmed || eventsConfirmed || rentalsConfirmed || meetingsConfirmed;
}

function searchableText(item: ProjectedRouteItem, props: OverviewViewProps): string[] {
  if (item.state === 'gap') return [props.labels.source('gap', item.reference.id)];
  if (!resolvedVisit(item) && !resolvedJourney(item)) {
    return [props.labels.source(item.reference.kind, item.reference.id), props.labels.unavailable];
  }
  if (resolvedVisit(item)) {
    const visit = item.source;
    const { stays, events } = visitFacts(
      visit.id,
      (props.sources.stays ?? []).filter((stay) => stay.tripId === props.tripId),
      (props.sources.events ?? []).filter((event) => event.tripId === props.tripId)
    );
    const context = contextRecords(props.sources, props.tripId).filter(
      (record) => record.source.visitId === visit.id
    );
    const rentals = (props.sources.rentals ?? []).filter(
      (rental) =>
        rental.tripId === props.tripId &&
        (rental.pickupVisitId === visit.id || rental.returnVisitId === visit.id)
    );
    return [
      props.sources.places?.find((place) => place.id === visit.placeId)?.name,
      visit.notes,
      visit.timing.arrival,
      visit.timing.departure,
      props.labels.status('workspace.sleep'),
      ...stays.flatMap((stay) => [
        stay.name,
        stay.kind,
        stay.status,
        stay.address,
        ...stay.hostLinks.flatMap((link) => [link.label, link.uri]),
      ]),
      ...events.flatMap((event) => [
        event.name,
        event.notes,
        event.address,
        event.reference,
        event.intention,
        event.arrangement,
        event.purchase,
      ]),
      ...context.flatMap(contextSearchableText),
      ...rentals.flatMap((rental) => [rental.provider, rental.status]),
    ].filter((value): value is string => Boolean(value));
  }
  const journey = item.source;
  return [journey.name, journey.reference, journey.notes].filter((value): value is string =>
    Boolean(value)
  );
}

function contextSearchableText(record: OverviewContextRecord): (string | null | undefined)[] {
  switch (record.kind) {
    case 'meeting':
      return [record.source.title, record.source.contactUri, record.source.notes];
    case 'capture':
      return [record.source.title, record.source.originalText, record.source.originalUrl];
    case 'idea':
      return [record.source.name, record.source.notes];
  }
}
