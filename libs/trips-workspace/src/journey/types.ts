import type { Client } from '../trips-api/client';
import type {
  JourneysGetResponses,
  JourneysUpdateData,
  JourneyLegsListResponses,
  JourneyLegsUpdateData,
  JourneyGroupsListResponses,
  JourneysTimingResponses,
} from '../trips-api/types.gen';

/** Canonical journey metadata from the owning Trips OpenAPI contract. */
export type Journey = JourneysGetResponses[200];
/** Canonical independently ordered transport source. */
export type JourneyLeg = JourneyLegsListResponses[200]['legs'][number];
/** Explicit source metadata patch; nested values replace complete objects. */
export type JourneyPatch = NonNullable<JourneysUpdateData['body']>;
/** Explicit leg patch; endpoints replace complete independent source values. */
export type LegPatch = NonNullable<JourneyLegsUpdateData['body']>;
/** Revisioned alternative membership, independent of journey source edits. */
export type JourneyGroup = JourneyGroupsListResponses[200]['groups'][number];
/** Read-only chronology projection; no nearby-booking safety inference. */
export type JourneyTiming = JourneysTimingResponses[200];
/** Host-owned identity and optional authenticated generated transport. */
export interface JourneyWorkspaceProps {
  tripId: number;
  journeyId: number;
  client?: Client;
  /** Hosts with literal source routes replace their URL when an explicit selection changes the viewed source. */
  onViewJourney?: (journeyId: number) => void;
}
/** One canonical source snapshot without timing or neighbouring booking copies. */
export interface JourneySource {
  journey: Journey;
  legs: JourneyLeg[];
}
/** Explicit serial source operation, also used for persisted undo. */
export type JourneyChange =
  | { kind: 'journey'; patch: JourneyPatch }
  | { kind: 'leg'; id: number; patch: LegPatch }
  | { kind: 'order'; ids: number[] }
  | { kind: 'create'; patch: LegPatch }
  | { kind: 'remove'; id: number };
