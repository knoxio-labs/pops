import type { ArrangementResponsibility } from '../arrangements/types';
import type { OverviewViewProps, OverviewSource } from './types';

/** A distinct owner-issued Contact and its recorded contexts. */
export interface WorkspacePerson {
  uri: string;
  contexts: string[];
}

/** Collect only explicitly linked Contact identities from meeting plans and arrangement responsibility. */
export function workspacePeople(props: OverviewViewProps): WorkspacePerson[] {
  const people = new Map<string, Set<string>>();
  for (const meeting of props.sources.meetings ?? []) {
    if (meeting.tripId !== props.tripId || meeting.removed || !meeting.contactUri) continue;
    const place = placeForVisit(props, meeting.visitId);
    const context = [place, meeting.title].filter((value): value is string => Boolean(value));
    addContext(people, meeting.contactUri, context.join(' · '));
  }
  for (const assignment of props.sources.responsibilities ?? []) {
    if (assignment.tripId !== props.tripId || assignment.responsibility?.kind !== 'contact')
      continue;
    const context = responsibilityContext(props, assignment);
    addContext(
      people,
      assignment.responsibility.uri,
      context || props.labels.source(assignment.targetKind, assignment.targetId)
    );
  }
  return [...people].map(([uri, contexts]) => ({ uri, contexts: [...contexts] }));
}

/** Resolve the one source identity covered by an explicit responsibility record. */
export function sourceResponsibility(
  props: OverviewViewProps,
  source: OverviewSource
): ArrangementResponsibility['responsibility'] | undefined {
  if (!isResponsibilitySource(source) || !props.sources.responsibilities) return undefined;
  return (
    props.sources.responsibilities.find(
      (assignment) =>
        assignment.tripId === props.tripId &&
        assignment.targetKind === source.kind &&
        assignment.targetId === source.id
    )?.responsibility ?? null
  );
}

/** Return only a Contact explicitly linked to the requested source or meeting. */
export function sourceContactUri(
  props: OverviewViewProps,
  source: OverviewSource
): string | undefined {
  if (source.kind === 'meeting')
    return (
      props.sources.meetings?.find(
        (meeting) => meeting.tripId === props.tripId && meeting.id === source.id && !meeting.removed
      )?.contactUri ?? undefined
    );
  const responsibility = sourceResponsibility(props, source);
  return responsibility?.kind === 'contact' ? responsibility.uri : undefined;
}

/** Resolve a source Contact only after its owner capability returned display metadata. */
export function workspaceContactName(props: OverviewViewProps, uri: string): string | undefined {
  return props.workspaceContactNames?.get(uri);
}

/** Resolve a source's explicitly assigned Contact name for timeline search. */
export function sourceContactName(
  props: OverviewViewProps,
  source: OverviewSource
): string | undefined {
  const uri = sourceContactUri(props, source);
  return uri ? workspaceContactName(props, uri) : undefined;
}

/** Whether the source identity is supported by the explicit responsibility contract. */
export function hasResponsibilityTarget(source: OverviewSource): boolean {
  return isResponsibilitySource(source);
}

function responsibilityContext(
  props: OverviewViewProps,
  assignment: ArrangementResponsibility
): string {
  const source = responsibilitySourceContext(props, assignment);
  const place = placeForVisit(props, source.visitId);
  return [place, source.title].filter((value): value is string => Boolean(value)).join(' · ');
}

interface ResponsibilitySourceContext {
  visitId: number | null;
  title: string | undefined;
}

function responsibilitySourceContext(
  props: OverviewViewProps,
  assignment: ArrangementResponsibility
): ResponsibilitySourceContext {
  switch (assignment.targetKind) {
    case 'stay':
      return stayResponsibilityContext(props, assignment.targetId);
    case 'event':
      return eventResponsibilityContext(props, assignment.targetId);
    case 'rental':
      return rentalResponsibilityContext(props, assignment.targetId);
    case 'journey':
      return journeyResponsibilityContext(props, assignment.targetId);
  }
}

function stayResponsibilityContext(
  props: OverviewViewProps,
  targetId: number
): ResponsibilitySourceContext {
  const stay = props.sources.stays?.find((source) => source.id === targetId);
  return { visitId: stay?.visitId ?? null, title: stay?.name ?? undefined };
}

function eventResponsibilityContext(
  props: OverviewViewProps,
  targetId: number
): ResponsibilitySourceContext {
  const event = props.sources.events?.find((source) => source.id === targetId);
  return { visitId: event?.visitId ?? null, title: event?.name ?? undefined };
}

function rentalResponsibilityContext(
  props: OverviewViewProps,
  targetId: number
): ResponsibilitySourceContext {
  const rental = props.sources.rentals?.find((source) => source.id === targetId);
  return { visitId: rental?.pickupVisitId ?? null, title: rental?.provider ?? undefined };
}

function journeyResponsibilityContext(
  props: OverviewViewProps,
  targetId: number
): ResponsibilitySourceContext {
  const journey = props.sources.journeys?.find((source) => source.id === targetId);
  return { visitId: null, title: journey?.name ?? undefined };
}

function placeForVisit(props: OverviewViewProps, visitId: number | null): string | undefined {
  const placeId = props.sources.visits?.find((visit) => visit.id === visitId)?.placeId;
  return props.sources.places?.find((place) => place.id === placeId)?.name;
}

function addContext(people: Map<string, Set<string>>, uri: string, context: string): void {
  const contexts = people.get(uri) ?? new Set<string>();
  if (context) contexts.add(context);
  people.set(uri, contexts);
}

function isResponsibilitySource(
  source: OverviewSource
): source is Extract<OverviewSource, { kind: ArrangementResponsibility['targetKind'] }> {
  return (
    source.kind === 'journey' ||
    source.kind === 'stay' ||
    source.kind === 'event' ||
    source.kind === 'rental'
  );
}
