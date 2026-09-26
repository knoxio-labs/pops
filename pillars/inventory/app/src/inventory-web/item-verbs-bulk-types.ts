import type { FixedPlacement } from '../foundation/model/model.js';
import type { FieldValueEntry, FieldValuePatch } from './commands.js';
import type { VerbRefusal } from './item-verbs.js';
import type { CatalogueType } from './useCatalogueLookups.js';

/** A refusal that applies to one item before or during a bulk operation. */
export type BulkItemRefusal = VerbRefusal | { kind: 'no-previous-place' };

/** One item and the reason its bulk command did not apply. */
export interface BulkRefusal {
  id: string;
  refusal: BulkItemRefusal;
}

/** The applied ids, per-item refusals, and one optional compensating operation. */
export interface BulkResult {
  /** Ids whose command applied, in input order. */
  applied: string[];
  refused: BulkRefusal[];
  /** Reverts every applied id; null when nothing applied. */
  undo: (() => Promise<void>) | null;
}

/** One item's typed value write: the patches already encoded for that item's type. */
export interface ItemValueWrite {
  id: string;
  patches: readonly FieldValuePatch[];
}

/** Thrown by a bulk `undo()` when any revert is not applied. */
export class BulkUndoRefusedError extends Error {
  readonly refused: BulkRefusal[];

  constructor(refused: BulkRefusal[]) {
    super('inventory bulk undo was refused');
    this.name = 'BulkUndoRefusedError';
    this.refused = refused;
  }
}

/** Typed bulk item verbs, with optimistic rows and per-item server outcomes. */
export interface BulkItemVerbs {
  /** Move every selected item to one fixed placement. */
  move(ids: readonly string[], to: FixedPlacement): Promise<BulkResult>;
  /** Store every selected item at one fixed placement. */
  store(ids: readonly string[], to: FixedPlacement): Promise<BulkResult>;
  /** Pick every selected item up. */
  pickUp(ids: readonly string[]): Promise<BulkResult>;
  /** Return each item to its own remembered fixed placement. */
  putBack(ids: readonly string[]): Promise<BulkResult>;
  /** Set every selected container's access state. */
  setAccess(ids: readonly string[], access: 'open' | 'closed'): Promise<BulkResult>;
  /** Apply one lifecycle state and reason to every selected item. */
  setLifecycle(
    ids: readonly string[],
    lifecycle: 'retired' | 'discarded',
    reason: string | null
  ): Promise<BulkResult>;
  /**
   * Set type on every id with stable type and value ids from the published
   * catalogue. Values default to an empty list for the server to derive.
   */
  changeType(
    ids: readonly string[],
    typeKey: string,
    values?: readonly FieldValueEntry[]
  ): Promise<BulkResult>;
  /** Set each item's already-encoded stable field patches. */
  editValues(writes: readonly ItemValueWrite[]): Promise<BulkResult>;
}

/** The published catalogue data needed by typed bulk commands. */
export interface BulkCatalogue {
  readonly revision: number | null;
  readonly types: readonly CatalogueType[];
}
