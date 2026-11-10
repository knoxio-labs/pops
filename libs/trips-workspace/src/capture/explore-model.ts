import type { Place, Visit } from '../stay/types';
import type { CaptureSource } from './types';

/** A membership row retains its producer identity even when its source is unavailable. */
export interface ExploreRow {
  membershipId: number;
  membershipRevision: number;
  source: { kind: 'capture' | 'idea' | 'event'; id: number };
  label: string | null;
  text: string | null;
  location:
    | { kind: 'place'; id: number }
    | { kind: 'unassigned' }
    | { kind: 'unavailable'; kindOfReference: 'place' | 'visit'; id: number };
  /** Only the owning source record controls availability; optional location metadata is independent. */
  unavailable: boolean;
}

/** Project active memberships by exact source identity and explicit location references only. */
export function projectExploreRows(
  source: CaptureSource,
  places: readonly Place[],
  visits: readonly Visit[]
): ExploreRow[] {
  return source.memberships
    .filter((membership) => membership.removedAt === null)
    .map((membership) => {
      const { source: key } = membership;
      if (key.kind === 'capture') return captureRow(source, places, membership, key.id);
      if (key.kind === 'idea') return ideaRow(source, places, membership, key.id);
      return eventRow({ source, places, visits, membership, id: key.id });
    });
}

function captureRow(
  source: CaptureSource,
  places: readonly Place[],
  membership: CaptureSource['memberships'][number],
  id: number
): ExploreRow {
  const row = source.captures.find(
    (candidate) => candidate.id === id && candidate.removedAt === null
  );
  return {
    ...membershipFields(membership),
    source: { kind: 'capture', id },
    label: row?.title ?? null,
    text: row?.originalText ?? null,
    location: placeLocation(row?.placeId ?? null, places),
    unavailable: row === undefined,
  };
}

function ideaRow(
  source: CaptureSource,
  places: readonly Place[],
  membership: CaptureSource['memberships'][number],
  id: number
): ExploreRow {
  const row = source.ideas.find((candidate) => candidate.id === id && candidate.removedAt === null);
  return {
    ...membershipFields(membership),
    source: { kind: 'idea', id },
    label: row?.name ?? null,
    text: row?.notes ?? null,
    location: placeLocation(row?.placeId ?? null, places),
    unavailable: row === undefined,
  };
}

function eventRow({
  source,
  places,
  visits,
  membership,
  id,
}: {
  source: CaptureSource;
  places: readonly Place[];
  visits: readonly Visit[];
  membership: CaptureSource['memberships'][number];
  id: number;
}): ExploreRow {
  const row = source.events.find((candidate) => candidate.id === id);
  const visitId = row?.visitId ?? null;
  const visit = visitId === null ? undefined : visits.find((candidate) => candidate.id === visitId);
  const location = eventLocation(row !== undefined, visitId, visit?.placeId ?? null, places);
  return {
    ...membershipFields(membership),
    source: { kind: 'event', id },
    label: row?.name ?? null,
    text: row?.notes ?? null,
    location,
    unavailable: row === undefined,
  };
}

function eventLocation(
  eventExists: boolean,
  visitId: number | null,
  placeId: number | null,
  places: readonly Place[]
): ExploreRow['location'] {
  if (!eventExists || visitId === null) return { kind: 'unassigned' };
  if (placeId === null) return { kind: 'unavailable', kindOfReference: 'visit', id: visitId };
  return placeLocation(placeId, places);
}

function membershipFields(
  membership: CaptureSource['memberships'][number]
): Pick<ExploreRow, 'membershipId' | 'membershipRevision'> {
  return { membershipId: membership.id, membershipRevision: membership.revision };
}

function placeLocation(placeId: number | null, places: readonly Place[]): ExploreRow['location'] {
  if (placeId === null) return { kind: 'unassigned' };
  if (places.some((place) => place.id === placeId)) return { kind: 'place', id: placeId };
  return { kind: 'unavailable', kindOfReference: 'place', id: placeId };
}
