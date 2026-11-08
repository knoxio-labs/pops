import { formatTripDate } from '@/fixtures/trip-overview-format';

import { isTripDate } from '../trip-route-editing/lodging-periods';

import type { IdeaState } from './model';

/** Format known source dates only, leaving unknown visit bounds without explanatory copy. */
export function visitDates(visit: IdeaState['visits'][number]): string {
  return [visit.from, visit.to].filter(isTripDate).map(formatTripDate).join(' → ');
}

/** Repeated city visits are identified by source date ranges rather than opaque IDs. */
export function visitLabel(state: IdeaState, id: string): string {
  const visit = state.visits.find((item) => item.id === id);
  if (!visit) return 'Visit unavailable';
  const name = state.cities.find((city) => city.id === visit.cityId)?.name ?? 'City unavailable';
  return [name, visitDates(visit)].filter(Boolean).join(' · ');
}
