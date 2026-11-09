import type { Place, Trip, Visit } from '../api/types';

/** A trip and its ordered visits; undefined visits means their source is unavailable. */
export interface HomeRecord {
  trip: Trip;
  visits: Visit[] | undefined;
}

/** Groups derived exclusively from the route's outer visit dates. */
export type HomeBucket = 'current' | 'upcoming' | 'other' | 'past';

/** Optional selection over the derived groups. */
export type HomeFilter = 'all' | HomeBucket;

/** Display fallback only; the derived title is never stored as a trip name. */
export function tripTitle(trip: Pick<Trip, 'name' | 'destination'>, unnamedLabel: string): string {
  const name = trip.name?.trim();
  if (name) return name;
  const destination = trip.destination.trim();
  return destination.length > 0 ? destination : unnamedLabel;
}

function calendarDate(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}

function boundaries(visits: Visit[] | undefined) {
  return {
    start: calendarDate(visits?.[0]?.timing.arrival),
    end: calendarDate(visits?.at(-1)?.timing.departure),
  };
}

/** Classifies outer bounds inclusively without interpreting When or any inner visit dates. */
export function bucketFor(record: HomeRecord, referenceDate: string): HomeBucket {
  if (!calendarDate(referenceDate)) return 'other';
  const { start, end } = boundaries(record.visits);
  if (start && end && start > end) return 'other';
  if (start && start > referenceDate) return 'upcoming';
  if (end && end < referenceDate) return 'past';
  return start && end ? 'current' : 'other';
}

/** Resolves an explicit parent reference only against available trip sources. */
export function parentTitle(
  trip: Trip,
  allTrips: Trip[],
  unnamedLabel: string
): string | undefined {
  const parent = allTrips.find((candidate) => candidate.id === trip.parentId);
  return parent ? tripTitle(parent, unnamedLabel) : undefined;
}

/** Resolves a place source without inventing a name for an unavailable reference. */
export function placeTitle(placeId: number, places: Place[], unavailableLabel: string): string {
  return places.find((place) => place.id === placeId)?.name ?? unavailableLabel;
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
}

function updatedAtOrder(left: HomeRecord, right: HomeRecord): number {
  const leftTime = Date.parse(left.trip.updatedAt);
  const rightTime = Date.parse(right.trip.updatedAt);
  if (!Number.isFinite(leftTime)) return Number.isFinite(rightTime) ? 1 : 0;
  if (!Number.isFinite(rightTime)) return -1;
  return rightTime - leftTime;
}

/** Searches stored text and resolvable sources; sorts newest instants first with stable ties and invalid updates last. */
export function filteredRecords({
  records,
  allTrips,
  places,
  query,
  bucket,
  referenceDate,
}: {
  records: HomeRecord[];
  allTrips: Trip[];
  places: Place[];
  query: string;
  bucket: HomeFilter;
  referenceDate: string;
}): HomeRecord[] {
  const search = normalized(query);
  return records
    .filter((record) => bucket === 'all' || bucketFor(record, referenceDate) === bucket)
    .filter(({ trip, visits }) => {
      const fields = [
        trip.name ?? '',
        trip.destination,
        trip.when,
        parentTitle(trip, allTrips, '') ?? '',
        ...(visits ?? []).map((visit) => placeTitle(visit.placeId, places, '')),
      ];
      return !search || fields.some((field) => normalized(field).includes(search));
    })
    .toSorted(updatedAtOrder);
}

/** Formats outer source dates in UTC; ellipses preserve each independently unknown boundary. */
export function boundaryLabel(visits: Visit[] | undefined, locale: string): string | undefined {
  if (!visits?.length) return undefined;
  const { start, end } = boundaries(visits);
  const formatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const format = (date: string | undefined) =>
    date ? formatter.format(new Date(`${date}T00:00:00Z`)) : '…';
  return `${format(start)} → ${format(end)}`;
}
