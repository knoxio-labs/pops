import type { ReactNode } from 'react';

import type { Rental } from '../arrangements/types';
import type { CalendarSelection } from '../calendar/types';
import type { CaptureSource } from '../capture/types';
import type { Journey, JourneyGroup } from '../journey/types';
import type { MeetingPlan } from '../people/types';
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
export type OverviewLinkKind = 'visit' | 'stay' | 'event' | 'journey' | 'decision';
/** Canonical source kinds opened contextually inside the owning Trip. */
export type OverviewKind = OverviewLinkKind | 'rental' | 'meeting' | 'capture' | 'idea';
/** Exact source identities remain discriminated even when numeric IDs coincide. */
export type OverviewSource = { [K in OverviewKind]: { kind: K; id: number } }[OverviewKind];
/** Existing contextual tools; each host mounts its canonical editor rather than another destination. */
export type OverviewTool = 'people' | 'capture' | 'inbox' | 'explore';
/** Existing explicit date/zone/source-window controls, owned by the Timeline host. */
export type OverviewCalendarSelection = CalendarSelection;
/** Controlled inline Calendar projection; no URL or default viewer timezone supplies a selection. */
export interface OverviewCalendarControl {
  selection: OverviewCalendarSelection;
  onChange: (selection: OverviewCalendarSelection) => void;
}
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
  meetings?: MeetingPlan[];
  capture?: CaptureSource;
  rentals?: Rental[];
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
interface OverviewBaseProps {
  tripId: number;
  client?: Client;
  locale: string;
  labels: OverviewLabels;
  backHref: string;
  settingsHref?: string;
  href?: (kind: OverviewLinkKind, id: number) => string | undefined;
  onOpenTool?: (tool: OverviewTool) => void;
  controls?: ReactNode;
  contextualEditor?: ReactNode;
  documentsHref?: string;
  calendarLink?: { href: string; label: string };
}
/** One owning Trip Timeline; an inline Calendar requires the host's exact contextual source opener. */
export type TripOverviewProps = OverviewBaseProps &
  (
    | { calendar: OverviewCalendarControl; onOpenSource: (source: OverviewSource) => void }
    | { calendar?: undefined; onOpenSource?: (source: OverviewSource) => void }
  );
/** A trip source with independently loaded surrounding facts. */
export type OverviewViewProps = TripOverviewProps & {
  trip: Trip;
  sources: OverviewSources;
};
