import type { ItemFieldValueSource } from '../db/schema.js';
import type {
  EffectiveComputedValue,
  ExpressionUnavailableReason,
  EvaluatedDependency,
} from './expression-types.js';
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

/** One stored or evaluated field projected with its effective provenance. */
export type EffectiveItemFieldValue =
  | {
      readonly fieldId: string;
      readonly state: 'value';
      readonly values: readonly (PrimitiveWireValue | ReadReferenceWireValue)[];
      readonly provenance:
        | { readonly source: 'stored'; readonly catalogueRevision: number }
        | { readonly source: 'override'; readonly catalogueRevision: number }
        | {
            readonly source: 'computed';
            readonly catalogueRevision: number;
            readonly dependencies: readonly EvaluatedDependency[];
          };
    }
  | {
      readonly fieldId: string;
      readonly state: 'unavailable';
      readonly reason: ExpressionUnavailableReason;
      readonly traversedItemIds: readonly string[];
      readonly provenance: Extract<
        EffectiveComputedValue,
        { readonly state: 'unavailable' }
      >['provenance'];
    };

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
