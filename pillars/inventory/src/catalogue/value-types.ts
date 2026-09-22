/** Shared public types for canonical persisted values. */
/** Every primitive kind supported by persisted catalogue fields. */
export const PRIMITIVE_KINDS = [
  'short_text',
  'long_text',
  'integer',
  'decimal',
  'boolean',
  'enum',
  'measurement',
  'date',
  'date_time',
  'url',
  'reference',
] as const;

/** A primitive kind supported by persisted catalogue fields. */
export type PrimitiveKind = (typeof PRIMITIVE_KINDS)[number];

/** Whether a field stores one value or an ordered collection of values. */
export type FieldCardinality = 'one' | 'many';

/** Whether a field is authoritative persisted input or a computed projection. */
export type FieldStorage = 'stored' | 'computed';

/** The validation-relevant portion of a persisted catalogue field definition. */
export interface ValueFieldDefinition {
  readonly id: string;
  readonly key: string;
  readonly kind: PrimitiveKind;
  readonly cardinality: FieldCardinality;
  readonly storage: FieldStorage;
  readonly fixedUnit: string | null;
  readonly enumOptionIds: ReadonlySet<string>;
  readonly archivedEnumOptionIds: ReadonlySet<string>;
  readonly referenceKinds: ReadonlySet<'item' | 'location'>;
  readonly referenceTypeIds: ReadonlySet<string>;
}

/** A canonical wire value together with its stable JSON storage representation. */
export interface CanonicalValue {
  readonly valueJson: string;
  readonly value: PrimitiveWireValue;
}

/** A protocol-independent primitive value accepted by the persisted value codec. */
export type PrimitiveWireValue =
  | string
  | number
  | boolean
  | EnumWireValue
  | MeasurementWireValue
  | ReferenceWireValue;

/** The stable ID reference used by a selected enum value. */
export interface EnumWireValue {
  readonly optionId: string;
}

/** A fixed-unit decimal amount stored without numeric conversion. */
export interface MeasurementWireValue {
  readonly amount: string;
  readonly unit: string;
}

/** A stable target reference permitted by a reference field. */
export interface ReferenceWireValue {
  readonly targetKind: 'item' | 'location';
  readonly targetId: string;
}

/** A machine-readable reason why a persisted field value was rejected. */
export type ValueValidationCode =
  | 'invalid_value'
  | 'invalid_decimal'
  | 'precision_overflow'
  | 'unit_mismatch'
  | 'enum_option_unknown'
  | 'enum_option_archived'
  | 'reference_kind_mismatch'
  | 'reference_type_mismatch'
  | 'target_missing';

/** An invalid canonical field value, annotated with its field and reason code. */
export class ValueValidationError extends Error {
  constructor(
    public readonly code: ValueValidationCode,
    public readonly fieldId: string,
    message: string
  ) {
    super(`field ${fieldId}: ${message}`);
    this.name = 'ValueValidationError';
  }
}
