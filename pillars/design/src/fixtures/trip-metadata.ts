/** Trip-level identity and source subtitle; calendar dates belong to route records. */
export interface TripMetadata {
  id: string;
  name?: string;
  countryCode: string;
  when?: string;
  stage: 'Planning' | 'Underway' | 'Past';
}

/** Fictional trip metadata shared by the overview proposals. */
export const tripMetadata: TripMetadata = {
  id: 'sample-brazil',
  countryCode: 'BR',
  when: 'Summer 2027–28',
  stage: 'Planning',
};

/** Prefer a custom name, otherwise format the selected country without parsing the subtitle. */
export function tripDisplayName(trip: TripMetadata): string {
  const country =
    new Intl.DisplayNames('en-AU', { type: 'region' }).of(trip.countryCode) ?? trip.countryCode;
  return trip.name?.trim() || country;
}
