import type { ItemFieldValueSource } from '../db/schema.js';
import type { CanonicalValue, PrimitiveWireValue, ReferenceWireValue } from './value-types.js';

/** One field's ordered values on the stable-id catalogue wire. */
export interface ItemFieldValueInput {
  readonly fieldId: string;
  readonly source: ItemFieldValueSource;
  readonly values: readonly unknown[];
}

/** One field's validated values ready for canonical persistence. */
export interface CanonicalItemFieldValueInput {
  readonly fieldId: string;
  readonly source: ItemFieldValueSource;
  readonly values: readonly CanonicalValue[];
}

/** Server read state for a reference target in a complete database snapshot. */
export type ReferenceTargetState = 'resolved' | 'deleted' | 'missing';

/** A reference value enriched for reads without changing its stored identity. */
export interface ReadReferenceWireValue extends ReferenceWireValue {
  readonly targetState: ReferenceTargetState;
}

/** One persisted field entry projected for a stable-id catalogue read. */
export interface ReadItemFieldValue {
  readonly fieldId: string;
  readonly source: ItemFieldValueSource;
  readonly catalogueRevision: number;
  readonly values: readonly (PrimitiveWireValue | ReadReferenceWireValue)[];
}

/** A structural failure in a complete item field set. */
export class ItemFieldSetError extends Error {
  constructor(
    public readonly code:
      | 'field_unknown'
      | 'field_archived'
      | 'type_archived'
      | 'field_duplicate'
      | 'source_invalid'
      | 'cardinality_invalid'
      | 'required_missing',
    public readonly fieldId: string,
    message: string
  ) {
    super(`field ${fieldId}: ${message}`);
    this.name = 'ItemFieldSetError';
  }
}
