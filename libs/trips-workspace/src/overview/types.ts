import type { Journey, JourneyGroup } from '../journey/types';
import type { Place, Stay, Trip, Visit } from '../stay/types';
import type { Client } from '../trips-api/client';
import type {
  DecisionsListResponses,
  DocumentAssociationsListResponses,
  EventsListResponses,
} from '../trips-api/types.gen';

/** Trip-owned event facts, retaining independent intention, arrangement and purchase. */
export type OverviewEvent = EventsListResponses[200]['events'][number];
/** Decision source facts; selection is never inferred from its linked arrangements. */
export type OverviewDecision = DecisionsListResponses[200]['decisions'][number];
/** Explicit Documents association; the referenced document remains externally owned. */
export type OverviewDocument = DocumentAssociationsListResponses[200]['associations'][number];
/** Source kinds which a host may connect to an actually published editor. */
export type OverviewKind = 'visit' | 'stay' | 'event' | 'journey' | 'decision';
/** Independently available collections; undefined never means an empty successful read. */
export interface OverviewSources {
  visits?: Visit[];
  places?: Place[];
  stays?: Stay[];
  events?: OverviewEvent[];
  journeys?: Journey[];
  groups?: JourneyGroup[];
  decisions?: OverviewDecision[];
  documents?: OverviewDocument[];
}
/** Host-localized control labels and deterministic source identity formatting. */
export interface OverviewLabels {
  trip: string;
  route: string;
  journeys: string;
  unassociated: string;
  decisions: string;
  documents: string;
  notes: string;
  empty: string;
  loading: string;
  unavailable: string;
  retry: string;
  settings: string;
  current: string;
  alternatives: string;
  selected: string;
  unresolved: string;
  source: (kind: string, id: number) => string;
  status: (value: string) => string;
}
/** Read-only overview identity; hosts supply only navigation to published source pages. */
export interface TripOverviewProps {
  tripId: number;
  client?: Client;
  locale: string;
  labels: OverviewLabels;
  backHref: string;
  settingsHref: string;
  href: (kind: OverviewKind, id: number) => string | undefined;
  documentsHref?: string;
  calendarLink?: { href: string; label: string };
}
/** A trip source with independently loaded surrounding facts. */
export interface OverviewViewProps extends TripOverviewProps {
  trip: Trip;
  sources: OverviewSources;
}
