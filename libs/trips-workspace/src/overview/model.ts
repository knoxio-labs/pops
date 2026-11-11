import type { Journey, JourneyGroup } from '../journey/types';
import type { Stay, Visit } from '../stay/types';
import type { OverviewEvent } from './types';

/** One explicit route occurrence and its associated independent records. */
export interface VisitRecord {
  visit: Visit;
  stays: Stay[];
  events: OverviewEvent[];
}
/** Explicit group membership with unresolved source identities retained. */
export interface JourneyRecords {
  groups: {
    group: JourneyGroup;
    current: Journey | undefined;
    alternatives: { id: number; journey: Journey | undefined }[];
  }[];
  independent: Journey[];
}

/** Preserve route occurrence order and attach only exact, explicit visit identities. */
export function visitRecords(
  visits: Visit[],
  stays: Stay[],
  events: OverviewEvent[]
): VisitRecord[] {
  return visits.map((visit) => ({
    visit,
    ...visitFacts(visit.id, stays, events),
  }));
}
/** Link independent accommodation and events by literal Visit identity, including unavailable occurrences. */
export function visitFacts(
  visitId: number,
  stays: Stay[],
  events: OverviewEvent[]
): Pick<VisitRecord, 'stays' | 'events'> {
  return {
    stays: stays.filter((stay) => stay.visitId === visitId),
    events: events.filter((event) => event.visitId === visitId),
  };
}
/** Keep absent and unavailable visit references visible without guessing a place association. */
export function detachedRecords<T extends { visitId: number | null }>(
  records: T[],
  visits: readonly Pick<Visit, 'id'>[]
): T[] {
  return detachedByVisit(records, visits, (record) => record.visitId);
}
/** Apply the same exact Visit membership test to canonical sources wrapped in a view reference. */
export function detachedByVisit<T>(
  records: T[],
  visits: readonly Pick<Visit, 'id'>[],
  visitId: (record: T) => number | null
): T[] {
  const identities = new Set(visits.map((visit) => visit.id));
  return records.filter((record) => {
    const id = visitId(record);
    return id === null || !identities.has(id);
  });
}
/** Explicit groups retain current and alternative identities, including unavailable sources. */
export function journeyRecords(journeys: Journey[], groups: JourneyGroup[]): JourneyRecords {
  const byId = new Map(journeys.map((journey) => [journey.id, journey]));
  const groupedIds = new Set(
    groups.flatMap((group) => [group.currentJourneyId, ...group.alternativeJourneyIds])
  );
  return {
    groups: groups.map((group) => ({
      group,
      current: byId.get(group.currentJourneyId),
      alternatives: group.alternativeJourneyIds.map((id) => ({ id, journey: byId.get(id) })),
    })),
    independent: journeys.filter((journey) => !groupedIds.has(journey.id)),
  };
}
/** Format valid calendar dates without moving their timezone; retain malformed source text. */
export function dateLabel(value: string | undefined | null, locale: string): string {
  if (!value) return '…';
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return value;
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return value;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
/** Independently unknown date boundaries stay unknown, including one-sided ranges. */
export function dateRange(
  start: string | undefined,
  end: string | undefined,
  locale: string
): string | undefined {
  return start || end ? `${dateLabel(start, locale)} → ${dateLabel(end, locale)}` : undefined;
}
/** Preserve approximate month precision and duration without inventing exact visit bounds. */
export function visitTiming(
  visit: Visit,
  locale: string,
  status: (value: string) => string
): string {
  const { timing } = visit;
  const month = timing.month;
  const monthLabel = month
    ? [
        month.part ? status(month.part) : undefined,
        new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
          new Date(
            `${String(month.year).padStart(4, '0')}-${String(month.month).padStart(2, '0')}-01T00:00:00Z`
          )
        ),
      ]
        .filter(Boolean)
        .join(' ')
    : undefined;
  const duration = timing.duration;
  return [
    dateRange(timing.arrival, timing.departure, locale),
    monthLabel,
    duration ? `${duration.min}–${duration.max} ${status(duration.unit)}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}
