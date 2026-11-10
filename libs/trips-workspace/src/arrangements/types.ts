import type { ContactChooserIntent, ContactsHostCapability } from '@pops/pillar-sdk';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { TripEvent } from '../event/types';
import type { Journey, JourneyLeg } from '../journey/types';
import type { Place, Stay, Trip, Visit } from '../stay/types';
import type { Client } from '../trips-api/client';
import type {
  RentalsGetResponses,
  RentalsUpdateData,
  ResponsibilitiesGetResponses,
} from '../trips-api/types.gen';

/** Independent rental source, including its optimistic revision and explicit Visit endpoints. */
export type Rental = RentalsGetResponses[200];
/** An explicit rental edit, guarded by the exact source revision used by the editor. */
export type RentalPatch = NonNullable<RentalsUpdateData['body']>;
/** Whole-arrangement responsibility; contact references remain opaque issued identities. */
export type ArrangementResponsibility = ResponsibilitiesGetResponses[200];
/** Actual whole source identity; a Journey is never a Visit association. */
export type ArrangementTarget = Pick<ArrangementResponsibility, 'targetKind' | 'targetId'>;
/** Source-preserving row; transport state belongs to each actual ordered leg. */
export type ArrangementRow =
  | { kind: 'stay'; source: Stay; visitId: number | null }
  | { kind: 'event'; source: TripEvent; visitId: number | null }
  | { kind: 'rental'; source: Rental; visitId: number | null }
  | { kind: 'journey'; source: Journey; legs: JourneyLeg[] | undefined; visitId: null };
/** Complete independently loaded collections; absent data must not assert an empty source. */
export interface ArrangementSources {
  trip?: Trip;
  visits?: Visit[];
  places?: Place[];
  stays?: Stay[];
  events?: TripEvent[];
  rentals?: Rental[];
  journeys?: Journey[];
  legs: ReadonlyMap<number, JourneyLeg[] | undefined>;
  responsibilities?: ArrangementResponsibility[];
}
/** Route occurrence or retained unassociated source bucket; repeated places remain distinct. */
export interface ArrangementGroup {
  id: string;
  visit?: Visit;
  unavailableVisitId?: number;
  rows: ArrangementRow[];
}
/** Independent source-fact filters; purchase never becomes a derived journey-wide state. */
export interface ArrangementFilters {
  query: string;
  kind: '' | ArrangementRow['kind'];
  purchase: '' | 'purchased' | 'not-purchased';
}
/** Host-translated necessary control labels, including every actual source-state enum value. */
export interface ArrangementLabels {
  title: string;
  invalidIdentity: string;
  loading: string;
  empty: string;
  search: string;
  kind: string;
  allKinds: string;
  purchase: string;
  allPurchases: string;
  notPurchased: string;
  noVisit: string;
  visit: string;
  contactReference: string;
  contactMissing: string;
  contactsUnavailable: string;
  contactReadError: string;
  referenceDetails: string;
  visitUnavailable: string;
  placeUnavailable: string;
  journey: string;
  stay: string;
  event: string;
  rental: string;
  close: string;
  handledBy: string;
  self: string;
  unset: string;
  clear: string;
  chooseContact: string;
  reconcileResponsibility: string;
  responsibilityUncertain: string;
  pickup: string;
  return: string;
  provider: string;
  start: string;
  end: string;
  status: string;
  save: string;
  undo: string;
  reload: string;
  sourceChanged: string;
  unknownCoverage: string;
  accommodationMissing: string;
  accommodationOverlap: string;
  addStay: string;
  creationUncertain: string;
  beginNewStay: string;
  sourceStates: Record<
    | 'Considering'
    | 'Agreed'
    | 'Reserved'
    | 'Purchased'
    | 'In plan'
    | 'Alternative'
    | 'Booked'
    | 'Not arranged'
    | 'Not needed',
    string
  >;
}
/** Host-owned source selection, translations, formatting and optional owner-issued Contact chooser. */
export interface ArrangementsWorkspaceProps {
  tripId: number;
  client?: Client;
  documentsClient?: DocumentsClient;
  labels: ArrangementLabels;
  formatDate: (date: string) => string;
  backHref?: string;
  contactChooserIntent?: (target: ArrangementTarget) => ContactChooserIntent;
  /** Advance only after this write's receipt or explicit reconciliation; retain all previous owner receipts. */
  advanceContactChooserIntent?: (target: ArrangementTarget, intent: ContactChooserIntent) => void;
  contacts?: ContactsHostCapability;
}
