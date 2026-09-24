/** The item a kind vector creates and the one field value it carries. */
import type { PrimitiveKind } from '../../../catalogue/value-types.js';
import type { FieldKeyName } from './catalogue-fields.js';

export interface VectorSpec {
  readonly name: string;
  readonly kind: PrimitiveKind;
  readonly cardinality: 'one' | 'many';
  readonly storage: 'stored' | 'computed';
  readonly fieldKey: FieldKeyName;
  readonly itemName: string;
  readonly values: readonly unknown[];
}

/** Existing rows a `reference` spec points at. */
export interface ReferenceSpecTargets {
  readonly liveTargetItemId: string;
  readonly liveLocationId: string;
}
