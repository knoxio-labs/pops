/** Calendar-only values persist as ISO dates; formatting never changes their timezone. */
export type TripDate = `${number}-${number}-${number}`;

/** Month precision is stored separately from exact dates and optional duration. */
export interface TripMonth {
  year: number;
  month: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  part?: 'early' | 'middle' | 'late';
}

/** Structured visit timing supports exact bounds, approximate months and relative order. */
export interface TripCityTiming {
  arrival?: TripDate;
  departure?: TripDate;
  month?: TripMonth;
  duration?: { min: number; max: number; unit: 'days' | 'weeks' };
  afterVisitId?: string;
  beforeVisitId?: string;
}

/** Date and optional local clock fields for an event, stay or transport record. */
export interface TripSchedule {
  start: TripDate;
  end?: TripDate;
  localTime?: `${number}:${number}`;
}

/** Persistable fixture data; display labels, date phrases and tiers are not stored here. */
export interface TripRecord {
  id: string;
  title?: string;
  kind: 'city' | 'transport' | 'stay' | 'event' | 'person' | 'idea' | 'gap';
  placeId: string;
  intention: 'In plan' | 'Considering' | 'Alternative';
  arrangement: 'Booked' | 'Agreed' | 'Not arranged' | 'Not needed';
  notes: string;
  purchase?: 'Purchased';
  timing?: TripCityTiming;
  schedule?: TripSchedule;
  route?: { fromId: string; toId: string; viaIds?: string[] };
  sequence?: number;
  visitId?: string;
  optionIds?: string[];
}

/** Deterministic view projection; title, where and when are generated from stored fields. */
export interface TripOverviewItem extends TripRecord {
  title: string;
  where: string;
  when: string;
}

/** Only purchased transport, accommodation and event tickets are hard constraints. */
export function isPurchasedArrangement(item: TripRecord): boolean {
  return item.purchase === 'Purchased' && ['transport', 'stay', 'event'].includes(item.kind);
}

function cityTier(timing: TripCityTiming): string {
  if (timing.arrival || timing.departure) return 'Planned dates';
  if (timing.month) return 'Approximate timing';
  if (timing.afterVisitId || timing.beforeVisitId) return 'Order only';
  return 'Dates unset';
}

/** Derive a readable information tier without assigning manual priority or firmness. */
export function tripItemTier(item: TripRecord): string {
  if (isPurchasedArrangement(item)) return 'Purchased';
  if (item.kind === 'city') return cityTier(item.timing ?? {});
  if (item.kind === 'event') return 'Wanted · not purchased';
  if (item.kind === 'transport' || item.kind === 'stay')
    return item.arrangement === 'Booked' ? 'Reserved · not purchased' : 'Not purchased';
  if (item.kind === 'gap') return 'Open segment';
  return item.intention;
}

/** Search keeps a matching event's city and an alternative's route segment visible. */
export function filterTripItems(items: TripOverviewItem[], query: string): TripOverviewItem[] {
  const term = query.trim().toLowerCase();
  if (!term) return items;
  const matches = items.filter((item) =>
    `${item.title} ${item.where} ${item.when} ${item.notes}`.toLowerCase().includes(term)
  );
  const matchIds = new Set(matches.map((item) => item.id));
  const visitIds = new Set(matches.map((item) => item.visitId));
  return items.filter(
    (item) =>
      matchIds.has(item.id) ||
      visitIds.has(item.id) ||
      item.optionIds?.some((id) => matchIds.has(id) || visitIds.has(id))
  );
}
