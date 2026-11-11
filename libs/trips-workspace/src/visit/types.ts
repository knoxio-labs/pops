import type { SemanticDraft } from '../shared/semantic-draft';
import type { Visit } from '../stay/types';
import type { Client } from '../trips-api/client';
import type { EventsListResponses, VisitsUpdateData } from '../trips-api/types.gen';
import type { DurationDraft, MonthDraft } from './approximate';

export type { Visit, Stay, Place } from '../stay/types';
/** Independent event source, including every explicit intention. */
export type TripEvent = EventsListResponses[200]['events'][number];
/** Explicit visit edits; a supplied timing object replaces the complete value. */
export type VisitPatch = NonNullable<VisitsUpdateData['body']>;
/** Workspace writes always include the exact confirmed source revision. */
export type GuardedVisitPatch = VisitPatch & { expectedRevision: number };
/** Raw approximate timing buffers and their mounted view's edit permission. */
export interface VisitTimingDrafts {
  month: SemanticDraft<MonthDraft>;
  duration: SemanticDraft<DurationDraft>;
  isCurrent: () => boolean;
}
/** Explicit direct-edit controls; unavailable optional context never blocks independent source facts. */
export interface VisitFieldProps {
  /** Retained semantic buffers supplied by the canonical source editor. */
  timingDrafts?: VisitTimingDrafts;
  visit: Visit;
  edit: (patch: VisitPatch) => void;
  commit: (patch: VisitPatch) => Promise<void> | void;
}
/** Literal owning source identities and an optional authenticated generated client. */
export interface VisitWorkspaceProps {
  tripId: number;
  visitId: number;
  client?: Client;
  onViewVisit?: (visitId: number) => void;
  onViewStay?: (stayId: number) => void;
  onViewEvent?: (eventId: number) => void;
}
