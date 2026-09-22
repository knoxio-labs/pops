/** Public protocol-1 compatibility shapes for persisted inventory values. */
import type { ItemFieldValueSource } from '../db/schema.js';
import type { CanonicalValue } from './value-codec.js';

/** A protocol-1 field object's old wire value shape. */
export type Protocol1FieldValue =
  | string
  | boolean
  | Protocol1MeasurementValue
  | Protocol1RangeValue;

/** A protocol-1 measurement before conversion to a persisted decimal. */
export interface Protocol1MeasurementValue {
  readonly value: number;
  readonly unit: string;
}

/** A protocol-1 range before migration splits it into fixed-unit measurements. */
export interface Protocol1RangeValue {
  readonly low: number;
  readonly high: number;
  readonly unit: string;
}

/** Protocol-1's key-addressed fields blob. */
export type Protocol1Fields = Readonly<Record<string, Protocol1FieldValue>>;

/** One canonical value set ready for `item_field_values`. */
export interface CanonicalItemFieldValues {
  readonly fieldId: string;
  readonly source: ItemFieldValueSource;
  readonly values: readonly CanonicalValue[];
}

/** A protocol-1 value rejected before it can be persisted or projected. */
export class Protocol1ValueError extends Error {
  constructor(
    public readonly fieldKey: string,
    message: string
  ) {
    super(`protocol-1 field ${fieldKey}: ${message}`);
    this.name = 'Protocol1ValueError';
  }
}
