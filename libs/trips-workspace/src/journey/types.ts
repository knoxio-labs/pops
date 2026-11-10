import type { Client } from '../trips-api/client';
import type {
  JourneysGetResponses,
  JourneysUpdateData,
  JourneyLegsListResponses,
  JourneyLegsUpdateData,
  JourneyGroupsListResponses,
  JourneysTimingResponses,
  JourneyLegsRemoveResponses,
} from '../trips-api/types.gen';

/** Canonical journey metadata from the owning Trips OpenAPI contract. */
export type Journey = JourneysGetResponses[200];
/** Canonical independently ordered transport source. */
export type JourneyLeg = JourneyLegsListResponses[200]['legs'][number];
/** Explicit source metadata patch; nested values replace complete objects. */
export type JourneyPatch = NonNullable<JourneysUpdateData['body']>;
/** Explicit leg patch; endpoints replace complete independent source values. */
export type LegPatch = Omit<NonNullable<JourneyLegsUpdateData['body']>, 'expectedRevision'>;
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
  legRevision: number;
}
/** Explicit serial source intent; execution pins a revision and one stable identity for reversible removal. */
export type JourneyChange =
  | { kind: 'journey'; patch: JourneyPatch }
  | ((
      | { kind: 'leg'; id: number; patch: LegPatch }
      | { kind: 'order'; ids: number[] }
      | { kind: 'create'; patch: LegPatch }
      | { kind: 'remove'; id: number; operationId?: string }
      | { kind: 'restore'; operationId: string }
    ) & { expectedRevision?: number });
/** Prepared source command; guarded writes cannot silently fall back to an unversioned legacy request. */
export type JourneyCommand =
  | Extract<JourneyChange, { kind: 'journey' }>
  | (Exclude<JourneyChange, { kind: 'journey' | 'remove' }> & { expectedRevision: number })
  | { kind: 'remove'; id: number; operationId: string; expectedRevision: number };
/** Producer-owned operation lifecycle and coherent current live collection. */
export type LegRemovalResult = JourneyLegsRemoveResponses[200];
/** Confirmed result; a replay from another lifecycle explicitly invalidates local inverse history. */
export interface JourneyChangeResult {
  source: JourneySource;
  inverse?: JourneyChange;
  clearHistory?: boolean;
}
