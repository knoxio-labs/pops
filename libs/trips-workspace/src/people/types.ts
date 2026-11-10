import type { ContactReferenceReadResult, ContactsHostCapability } from '@pops/pillar-sdk';

import type { Client } from '../trips-api/client';
import type {
  MeetingPlansListResponses,
  MeetingPlansOperateData,
  MeetingPlansOperateResponses,
} from '../trips-api/types.gen';

/** Independent trip-owned meeting source, generated from the producer snapshot. */
export type MeetingPlan = MeetingPlansListResponses[200]['meetingPlans'][number];
/** Idempotent command whose identity must survive an uncertain response. */
export type MeetingOperation = NonNullable<MeetingPlansOperateData['body']>;
/** Canonical current source and immutable operation receipt returned by Trips. */
export type MeetingResult = MeetingPlansOperateResponses[200];
/** Only explicit changes to independent meeting facts. */
export type MeetingPatch = Extract<MeetingOperation['command'], { kind: 'update' }>['patch'];
/** Host translations; source values remain distinct from their displayed labels. */
export type PeopleText = (key: PeopleTextKey, values?: Record<string, string | number>) => string;
/** Translation keys required by the public meeting workspace. */
export type PeopleTextKey =
  | 'title'
  | 'trip'
  | 'trips'
  | 'add'
  | 'undo'
  | 'retry'
  | 'reload'
  | 'loading'
  | 'invalid'
  | 'failed'
  | 'contextFailed'
  | 'search'
  | 'all'
  | 'intention'
  | 'agreement'
  | 'visit'
  | 'unassociated'
  | 'visitUnavailable'
  | 'placeUnavailable'
  | 'contactUnverified'
  | 'contactMissing'
  | 'contactUnavailable'
  | 'contactReadError'
  | 'contactCanonical'
  | 'contactCleared'
  | 'chooserUnavailable'
  | 'contact'
  | 'chooseContact'
  | 'clearContact'
  | 'openContact'
  | 'planTitle'
  | 'notes'
  | 'startDate'
  | 'endDate'
  | 'unknownDate'
  | 'reversedDates'
  | 'remove'
  | 'Considering'
  | 'Planned'
  | 'Not agreed'
  | 'Agreed';
/** Contacts-owned read result; failed reads never assert that a retained identity is missing. */
export type MeetingContact = ContactReferenceReadResult | { status: 'unverified' };
/** Authenticated source identity, translations, and source-owner integrations supplied by the host. */
export interface PeopleWorkspaceProps {
  tripId: number;
  /** Select only this canonical meeting within the owning trip and API origin; missing targets never fall back. */
  meetingId?: MeetingPlan['id'];
  client?: Client;
  text: PeopleText;
  contacts?: ContactsHostCapability;
}
