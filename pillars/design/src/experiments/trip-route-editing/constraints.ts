import type { TripRecord } from '@/fixtures/trip-overview-model';

/** Compare only stays/events with visit bounds; transport spans cities by definition. */
export function outsideVisit(visit: TripRecord, item: TripRecord): boolean {
  if (!item.schedule || item.kind === 'transport') return false;
  const timing = visit.timing;
  if (timing?.arrival && item.schedule.start < timing.arrival) return true;
  return Boolean(
    timing?.departure && (item.schedule.end ?? item.schedule.start) > timing.departure
  );
}
