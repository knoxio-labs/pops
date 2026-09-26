/**
 * The shapes every inventory design screen draws, in ADR-001/002 terms: one
 * tracked-thing noun (an item, some of them containers), a fixed location
 * tree, and placement as location, container or in hand.
 *
 * Access, lifecycle and sync are three independent axes. A closed container
 * is not a retired one, and a stale copy is neither.
 */

/** Whether the item still exists and counts. `destroyed` is terminal. */
export type Lifecycle = 'active' | 'retired' | 'discarded' | 'lost' | 'destroyed';

/** A container's only access axis. Sealing and unpacking are history events, not states. */
export type ContainerAccess = 'open' | 'closed';

/** Whether this copy agrees with the server, quietest first. `synced` draws nothing. */
export type SyncState = 'synced' | 'queued' | 'sending' | 'stale' | 'needs-attention';

/** A place something can sit that is not the pocket. */
export type FixedPlacement =
  | { kind: 'location'; locationId: string }
  | { kind: 'container'; containerId: string };

/** Where an item is right now. In hand is a first-class placement, not an absence. */
export type Placement = FixedPlacement | { kind: 'in-hand' };

/**
 * The one remembered previous placement. A location that was deleted while
 * the item was in hand keeps only its name, which is what "Previous place
 * deleted" shows.
 */
export type PreviousPlacement = FixedPlacement | { kind: 'deleted'; name: string };

/** A target a move, drop or Store here can aim at. */
export type PlacementTarget = Placement;

/** What makes an item a container: present only when its type grants containment. */
export interface ContainerFacts {
  access: ContainerAccess;
  /** A manual flag a person sets when a box will take nothing more. */
  full: boolean;
}

/** One item as every list, row, card and picker reads it. */
export interface ItemRowModel {
  id: string;
  name: string;
  typeId: string | null;
  /** Null means untyped: filed before its type existed. */
  typeName: string | null;
  /** Optional, owner-chosen, unique case-insensitively. */
  code: string | null;
  /** At least 1. A container is always 1. */
  quantity: number;
  container: ContainerFacts | null;
  lifecycle: Lifecycle;
  placement: Placement;
  previous: PreviousPlacement | null;
  sync: SyncState;
  photoUrl: string | null;
  note: string | null;
  updatedAt: string;
}

/** The kind of place a location is, used only for its icon and copy. */
export type LocationKind = 'property' | 'room' | 'furniture' | 'storage' | 'area';

/** One node of the fixed location tree. */
export interface LocationModel {
  id: string;
  name: string;
  parentId: string | null;
  kind: LocationKind;
}

/** Everything a history row can record. */
export type EventKind =
  | 'created'
  | 'moved'
  | 'picked-up'
  | 'put-back'
  | 'opened'
  | 'closed'
  | 'field-changed'
  | 'type-set'
  | 'code-set'
  | 'quantity-changed'
  | 'split'
  | 'retired'
  | 'discarded'
  | 'lost'
  | 'destroyed'
  | 'restored'
  | 'photo-added'
  | 'connected';

/** Who wrote an event: a phone, this web app, a service account or a catalogue migration. */
export type EventActor = 'device' | 'web' | 'service' | 'migration';

/** One append-only history event. Undo is a compensating event, never a delete. */
export interface EventModel {
  id: string;
  itemId: string;
  itemName: string;
  kind: EventKind;
  at: string;
  actor: EventActor;
  actorName: string;
  /** Literal, one line: "Moved to Garage shelf". */
  summary: string;
  before: string | null;
  after: string | null;
  reason: string | null;
  undoable: boolean;
}
