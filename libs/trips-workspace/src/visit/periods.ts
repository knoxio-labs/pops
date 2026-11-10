import type { Stay, TripEvent, Visit } from './types';

/** Checkout-exclusive calendar segment referencing independent accommodation and activity sources. */
export interface AccommodationPeriod {
  arrival: string;
  departure: string;
  stays: Stay[];
  events: TripEvent[];
}
/** Visit projection retaining partial accommodation and activities that cannot be placed in a period. */
export interface AccommodationProjection {
  periods: AccommodationPeriod[];
  unplacedStays: Stay[];
  unplacedEvents: TripEvent[];
}
/** Validate a source calendar date without assigning a clock or viewer timezone. */
export function validDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
/** Source-list certainty and optional bounded periods whose coverage has not yet been classified. */
export interface AccommodationPeriodOptions {
  accommodationComplete: boolean;
  includeUnknownVisitPeriods?: boolean;
}
/**
 * Group explicit Visit memberships by accommodation boundaries. Incomplete sources do not
 * assert gaps. Coverage classifiers may request unknown Visit periods for explicit classification;
 * their empty membership never itself asserts missing accommodation.
 */
export function accommodationPeriods(
  visit: Visit,
  candidates: Stay[],
  activities: TripEvent[],
  context: boolean | AccommodationPeriodOptions = true
): AccommodationProjection {
  const { accommodationComplete, includeUnknownVisitPeriods = false } =
    typeof context === 'boolean' ? { accommodationComplete: context } : context;
  const associated = candidates.filter((stay) => stay.visitId === visit.id);
  const dated = associated.filter((stay) => bounded(stay.timing));
  const unplacedStays = associated.filter((stay) => !bounded(stay.timing));
  const gapsKnown =
    bounded(visit.timing) &&
    (includeUnknownVisitPeriods || (accommodationComplete && unplacedStays.length === 0));
  const periods = buildPeriods(visit, dated, gapsKnown);
  const unplacedEvents: TripEvent[] = [];
  for (const event of activities.filter((item) => item.visitId === visit.id)) {
    const start = event.timing.start;
    const period = validDate(start)
      ? periods.find((item) => start >= item.arrival && start < item.departure)
      : undefined;
    if (period) period.events.push(event);
    else unplacedEvents.push(event);
  }
  return { periods, unplacedStays, unplacedEvents };
}
function buildPeriods(visit: Visit, dated: Stay[], gapsKnown: boolean): AccommodationPeriod[] {
  const sources = bounded(visit.timing) ? [visit, ...dated] : dated;
  const dates = [
    ...new Set(
      sources
        .flatMap((source) => [source.timing.arrival, source.timing.departure])
        .filter(validDate)
    ),
  ].toSorted();
  const periods: AccommodationPeriod[] = [];
  for (let index = 1; index < dates.length; index += 1) {
    const arrival = dates[index - 1];
    const departure = dates[index];
    if (!arrival || !departure) continue;
    const stays = dated.filter((stay) => intersects(stay.timing, arrival, departure));
    if (!stays.length && !(gapsKnown && insideVisit(visit, arrival, departure))) continue;
    const previous = periods.at(-1);
    if (previous?.departure === arrival && sameStays(previous.stays, stays))
      previous.departure = departure;
    else periods.push({ arrival, departure, stays, events: [] });
  }
  return periods;
}
function intersects(timing: Stay['timing'], arrival: string, departure: string): boolean {
  return (
    timing.arrival !== undefined &&
    timing.departure !== undefined &&
    timing.arrival < departure &&
    timing.departure > arrival
  );
}
function insideVisit(visit: Visit, arrival: string, departure: string): boolean {
  return (
    visit.timing.arrival !== undefined &&
    visit.timing.departure !== undefined &&
    arrival >= visit.timing.arrival &&
    departure <= visit.timing.departure
  );
}
function bounded(timing: Stay['timing']): boolean {
  return (
    validDate(timing.arrival) && validDate(timing.departure) && timing.departure > timing.arrival
  );
}
function sameStays(first: Stay[], second: Stay[]): boolean {
  return (
    first.length === second.length && first.every((stay, index) => stay.id === second[index]?.id)
  );
}
/** Format retained calendar facts without shifting them to the viewer timezone. */
export function dateLabel(value: string | undefined, locale: string): string {
  return validDate(value)
    ? new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${value}T12:00:00Z`))
    : (value ?? '');
}
