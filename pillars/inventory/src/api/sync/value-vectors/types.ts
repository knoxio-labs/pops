/** Types of the committed protocol-2 value-vector file (`contracts/value-vectors-v1.json`). */
import type { CatalogueDescriptor } from '../../../catalogue/authoring-types.js';
import type { PrimitiveKind } from '../../../catalogue/value-types.js';
import type { SyncComputedValue } from '../../../contract/rest-sync-computed-schemas.js';
import type { SyncItem, SyncItemFieldValue, SyncLocation } from '../wire.js';
import type { NegativeValueVector } from './negative-vectors.js';

/** The mutation the engine applied to produce a vector's value. */
export interface ValueVectorCommand {
  readonly mutationId: string;
  readonly op: string;
  readonly entityId: string;
  readonly baseRevision?: number | null;
  readonly catalogueRevision?: number;
  readonly args: unknown;
}

/**
 * A reference value names only `{targetKind, targetId}`; its target's state is
 * whatever row the consumer holds. `null` is a target no row exists for.
 */
export type ValueVectorReferenceTarget =
  | { readonly kind: 'item'; readonly item: SyncItem }
  | { readonly kind: 'location'; readonly location: SyncLocation }
  | null;

/** One kind/cardinality/state case, projected through `toSyncItem` after every write. */
export interface ValueVector {
  readonly name: string;
  readonly kind: PrimitiveKind;
  readonly cardinality: 'one' | 'many';
  readonly storage: 'stored' | 'computed';
  readonly fieldId: string;
  readonly itemId: string;
  readonly item: SyncItem;
  readonly fieldValue: SyncItemFieldValue | null;
  readonly computedValue: SyncComputedValue | null;
  readonly command: ValueVectorCommand;
  /** For `reference` vectors, one entry per element of `fieldValue.values`, in order. */
  readonly referenceTargets?: readonly ValueVectorReferenceTarget[];
}

export type { NegativeValueVector } from './negative-vectors.js';

/** The committed file. */
export interface ValueVectorFile {
  readonly version: 1;
  readonly liveRevision: number;
  readonly currentRevision: number;
  readonly typeId: string;
  /** Both published revisions, as the type-catalogue read route serves them. */
  readonly catalogues: readonly CatalogueDescriptor[];
  readonly vectors: readonly ValueVector[];
  readonly negativeVectors: readonly NegativeValueVector[];
}
