import { formatTripDate } from './trip-overview-format';

import type { TripDate } from './trip-overview-model';

/** Trip-level values; a user name is optional and dates are calendar values. */
export interface TripMetadata {
  id: string;
  name?: string;
  countryCode: string;
  departureDate: TripDate;
  returnDate?: TripDate;
  stage: 'Planning' | 'Underway' | 'Past';
}

/** Fictional trip metadata shared by the overview proposals. */
export const tripMetadata: TripMetadata = {
  id: 'sample-brazil',
  countryCode: 'BR',
  departureDate: '2027-11-24',
  stage: 'Planning',
};

/** Prefer the user name; otherwise generate destination and departure year deterministically. */
export function tripDisplayName(trip: TripMetadata): string {
  const country =
    new Intl.DisplayNames('en-AU', { type: 'region' }).of(trip.countryCode) ?? trip.countryCode;
  const name = trip.name?.trim();
  if (name) return name;
  return `${country} · ${trip.departureDate.slice(0, 4)}`;
}

/** Format trip bounds without inferring a return date from the last wanted event. */
export function tripDateLabel(trip: TripMetadata): string {
  return `${formatTripDate(trip.departureDate)} ${trip.departureDate.slice(0, 4)} → ${trip.returnDate ? formatTripDate(trip.returnDate) : 'return date unset'}`;
}
