import type { Capture, CaptureSource } from './types';

type Classification = NonNullable<Capture['classification']>;
type Idea = CaptureSource['ideas'][number];
const classifications: Record<Classification, Classification> = {
  idea: 'idea',
  note: 'note',
  event: 'event',
  link: 'link',
  document: 'document',
};
const kinds: Record<NonNullable<Idea['kind']>, NonNullable<Idea['kind']>> = {
  destination: 'destination',
  place: 'place',
  activity: 'activity',
};
const purposes: Record<NonNullable<Idea['purpose']>, NonNullable<Idea['purpose']>> = {
  visit: 'visit',
  'meet-people': 'meet-people',
  'see-someone': 'see-someone',
  other: 'other',
};
const statuses: Record<NonNullable<Idea['status']>, NonNullable<Idea['status']>> = {
  Saved: 'Saved',
  Considering: 'Considering',
  'In plan': 'In plan',
};

/** Complete finite classification choices from the published Capture enum. */
export const captureClassifications = Object.values(classifications);
/** Complete finite subtype choices from the independent Idea contract. */
export const ideaKinds = Object.values(kinds);
/** Explicit Idea purposes; no choice follows automatically from kind. */
export const ideaPurposes = Object.values(purposes);
/** Independent planning status choices; none inserts a route visit. */
export const ideaStatuses = Object.values(statuses);
