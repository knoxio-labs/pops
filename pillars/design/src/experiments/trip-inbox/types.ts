import type { TripRecord } from '../../fixtures/trip-overview-model';
import type { TripPlace } from '../../fixtures/trip-places';
import type { CapturedItem, CaptureState } from '../trip-quick-capture/model';

/** A local organisation target supported by the generic item creator, independent of route insertion. */
export type InboxTargetKind = Exclude<TripRecord['kind'], 'gap'>;

/** One explicit association; neither source material nor target fields are owned by this link. */
export interface InboxAssociation {
  id: string;
  sourceId: string;
  targetId: string;
}

/** Immutable captured material, independent typed items, and source-owned route membership. */
export interface InboxState {
  capture: CaptureState;
  targets: TripRecord[];
  places: TripPlace[];
  routeOrder: string[];
  associations: InboxAssociation[];
  creationDefaults: { intention: TripRecord['intention']; arrangement: TripRecord['arrangement'] };
}

/** Explicit new-item input; source text never supplies a missing kind, title, location or visit. */
export interface InboxNewTargetDraft {
  kind: string;
  title: string;
  placeId: string;
  visitId: string;
  notes: string;
  intention: string;
  arrangement: string;
}

/** Captured-source text and explicit association status filters; classification alone is never organisation. */
export interface InboxFilters {
  query: string;
  organisation: 'all' | 'organised' | 'unorganised';
}

/** A current source projection, retaining broken links for review and removal. */
export interface InboxRow {
  id: string;
  source?: CapturedItem;
  label: string;
  associations: { association: InboxAssociation; target?: TripRecord; label: string }[];
  validAssociationCount: number;
  organised: boolean;
  findings: { id: string; message: string }[];
}

/** Named fictional capture and organisation review states. */
export type InboxScenario =
  | 'default'
  | 'empty'
  | 'organised'
  | 'missing-reference'
  | 'files'
  | 'duplicate-names';

/** Explicit source kind choices for creating a generic target; dedicated route-section editing remains separate. */
export const inboxTargetKinds: readonly { id: InboxTargetKind; label: string }[] = [
  { id: 'city', label: 'City / region' },
  { id: 'transport', label: 'Transport' },
  { id: 'stay', label: 'Accommodation' },
  { id: 'event', label: 'Event' },
  { id: 'person', label: 'Person' },
  { id: 'idea', label: 'Activity / idea' },
];

/** Existing source planning intentions available for explicit item creation. */
export const inboxIntentions: readonly { id: TripRecord['intention']; label: string }[] = [
  { id: 'In plan', label: 'In plan' },
  { id: 'Considering', label: 'Considering' },
  { id: 'Alternative', label: 'Alternative' },
];

/** Existing source arrangement facts, independent of purchase or inferred item requirements. */
export const inboxArrangements: readonly { id: TripRecord['arrangement']; label: string }[] = [
  { id: 'Booked', label: 'Booked' },
  { id: 'Agreed', label: 'Agreed' },
  { id: 'Not arranged', label: 'Not arranged' },
  { id: 'Not needed', label: 'Not needed' },
];
