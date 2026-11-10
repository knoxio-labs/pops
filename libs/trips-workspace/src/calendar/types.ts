import type { JourneyGroup } from '../journey/types';
import type { Stay } from '../stay/types';
import type { Client } from '../trips-api/client';
import type { EventsListResponses, JourneysWorkspaceResponses } from '../trips-api/types.gen';

/** Published event source, including every independent intention. */
export type CalendarEvent = EventsListResponses[200]['events'][number];
/** Exact source identity opened by the host, without visit inference. */
export type CalendarSource = { kind: 'journey' | 'stay' | 'event'; id: number };
/** Host-owned transport, language and exact source navigation. */
export interface CalendarWorkspaceProps {
  tripId: number;
  client?: Client;
  locale: string;
  onOpenSource: (source: CalendarSource) => void;
}
/** Atomic owning journey response: source and derived timing share one SQLite read snapshot. */
export type CalendarJourney = JourneysWorkspaceResponses[200];
/** Complete required read snapshot; a failed collection never becomes an empty array. */
export interface CalendarSnapshot {
  journeys: CalendarJourney[];
  groups: JourneyGroup[];
  stays: Stay[];
  events: CalendarEvent[];
}
/** Independent source endpoints; instants require unambiguous clocks. Placement dates clip presentation only, never source facts. */
export interface CalendarEntry {
  key: string;
  source: CalendarSource;
  title: string;
  boundary: 'departure' | 'arrival' | 'checkIn' | 'checkOut' | 'start' | 'end' | 'unknown';
  date?: string;
  clock?: string;
  zone?: string;
  instant: string | null;
  endDate?: string;
  endInstant?: string | null;
  endExclusive?: boolean;
  placementDate?: string;
  continuing?: boolean;
  purchased: boolean;
  facts: string[];
  conflict: boolean;
}
/** Explicit calendar controls; blank bounds are open, blank zone requires a user choice. */
export interface CalendarSelection {
  from: string;
  to: string;
  zone: string;
  kind: 'all' | CalendarSource['kind'];
  journey: string;
}
