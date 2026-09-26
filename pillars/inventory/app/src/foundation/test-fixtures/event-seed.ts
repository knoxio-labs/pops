/**
 * The authored part of a fixture history event. The seed files write these;
 * `events.ts` fills in ids and actor names.
 */
import type { EventActor, EventKind } from '../model/model';

/** The authored part of an event; ids and actor names are filled in. */
export interface EventSeed {
  kind: EventKind;
  itemId: string;
  itemName: string;
  at: string;
  summary: string;
  actor?: EventActor;
  before?: string;
  after?: string;
  reason?: string;
  undoable?: boolean;
}
