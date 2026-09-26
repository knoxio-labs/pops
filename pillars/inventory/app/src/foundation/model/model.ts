/** Whether an inventory item still exists and counts. `destroyed` is terminal. */
export type Lifecycle = 'active' | 'retired' | 'discarded' | 'lost' | 'destroyed';

/** A container's access state. Sealing and unpacking are history events, not states. */
export type ContainerAccess = 'open' | 'closed';

/** Whether a local inventory copy agrees with the server, quietest first. */
export type SyncState = 'synced' | 'queued' | 'sending' | 'stale' | 'needs-attention';

/** A fixed place where an item can sit. */
export type FixedPlacement =
  | { kind: 'location'; locationId: string }
  | { kind: 'container'; containerId: string };

/** An item's current place. In hand is a first-class placement. */
export type Placement = FixedPlacement | { kind: 'in-hand' };

/**
 * An item's remembered previous placement. A deleted location retains only
 * the display name that was valid when the item left it.
 */
export type PreviousPlacement = FixedPlacement | { kind: 'deleted'; name: string };

/** A destination accepted by move, drop, and Store here operations. */
export type PlacementTarget = Placement;

/** Container-specific state, present only when an item's type grants containment. */
export interface ContainerFacts {
  access: ContainerAccess;
  /** A person-managed signal that the container should take nothing more. */
  full: boolean;
}

/** The shared item shape consumed by inventory rows, cards, and placement controls. */
export interface ItemRowModel {
  id: string;
  name: string;
  typeId: string | null;
  /** Null identifies an item recorded before its type existed. */
  typeName: string | null;
  /** An optional owner-chosen code that is unique case-insensitively. */
  code: string | null;
  /** At least one; containers always have quantity one. */
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

/** A location's semantic kind, used for icon and copy selection. */
export type LocationKind = 'property' | 'room' | 'furniture' | 'storage' | 'area';

/** One node in the fixed inventory location tree. */
export interface LocationModel {
  id: string;
  name: string;
  parentId: string | null;
  kind: LocationKind;
}

/** An append-only inventory history event kind. */
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

/** The class of actor that wrote an inventory event. */
export type EventActor = 'device' | 'web' | 'service' | 'migration';

/** One append-only history event. Undo creates a compensating event rather than deleting it. */
export interface EventModel {
  id: string;
  itemId: string;
  itemName: string;
  kind: EventKind;
  at: string;
  actor: EventActor;
  actorName: string;
  /** A literal one-line summary, such as "Moved to Garage shelf". */
  summary: string;
  before: string | null;
  after: string | null;
  reason: string | null;
  undoable: boolean;
}
