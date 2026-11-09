import type { Availability, Person } from '../contact-person-detail/model';

/** A source contact identity; equal names never merge independently identified people. */
export interface TripPeopleContact {
  id: string;
  person: Person;
}

/** Exact source route visit; repeated cities keep distinct visit identities and optional unknown bounds. */
export interface TripPeopleVisit {
  id: string;
  cityId: string;
  name: string;
  from: string;
  to: string;
}

/** A local meeting intention and separate agreement; dates are optional calendar dates, never appointment clocks. */
export interface TripPersonPlan {
  id: string;
  contactId: string;
  visitId: string;
  title: string;
  notes: string;
  intention: 'Considering' | 'Planned';
  agreement: 'Not agreed' | 'Agreed';
  from: string;
  to: string;
}

/** Independent contacts, route and city sources with local person-to-trip meeting plans. */
export interface TripPeopleState {
  contacts: TripPeopleContact[];
  plans: TripPersonPlan[];
  visits: TripPeopleVisit[];
  cities: { id: string; name: string }[];
}

/** Explicit source-backed filters; empty selections impose no constraint. */
export interface PeopleFilters {
  query: string;
  intention: string;
  agreement: string;
  visitId: string;
}

/** A source incompatibility or invalid selected fact; a missing window alone is never unavailability. */
export interface PeopleFinding {
  id: string;
  message: string;
}

/** A plan projection retaining its own person source and exact optional visit identity. */
export interface PeopleRow {
  id: string;
  plan: TripPersonPlan;
  contact?: TripPeopleContact;
  personName: string;
  visit?: TripPeopleVisit;
  visitLabel: string;
  availability: { source: Availability; overlap: string; from: string; to: string }[];
  findings: PeopleFinding[];
}

/** Named fictional review scenarios for linking and planning. */
export type PeopleScenario = 'default' | 'empty' | 'undated' | 'missing-reference' | 'conflicting';
