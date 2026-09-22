/** Dispatches persisted primitive kinds to their canonical validators. */
import {
  canonicalDecimal,
  canonicalEnum,
  canonicalMeasurement,
  canonicalReference,
  canonicalDate,
  canonicalDateTime,
  canonicalUrl,
  invalid,
  scalarLength,
} from './value-codec.js';

import type {
  CanonicalValue,
  PrimitiveKind,
  PrimitiveWireValue,
  ValueFieldDefinition,
} from './value-types.js';

type Validator = (field: ValueFieldDefinition, value: unknown) => CanonicalValue;

function stringValue(field: ValueFieldDefinition, value: unknown, limit: number): CanonicalValue {
  if (typeof value !== 'string' || scalarLength(value) < 1 || scalarLength(value) > limit)
    throw invalid(field, `must contain 1 to ${limit.toLocaleString()} Unicode scalar values`);
  return { valueJson: JSON.stringify(value), value };
}
function integerValue(field: ValueFieldDefinition, value: unknown): CanonicalValue {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw invalid(field, 'must be a safe JSON integer');
  return { valueJson: JSON.stringify(value), value };
}
function booleanValue(field: ValueFieldDefinition, value: unknown): CanonicalValue {
  if (typeof value !== 'boolean') throw invalid(field, 'must be a boolean');
  return { valueJson: JSON.stringify(value), value };
}
function wrapped(
  field: ValueFieldDefinition,
  value: unknown,
  validator: (field: ValueFieldDefinition, value: unknown) => PrimitiveWireValue
): CanonicalValue {
  const canonical = validator(field, value);
  return { valueJson: JSON.stringify(canonical), value: canonical };
}
const VALIDATORS: Record<PrimitiveKind, Validator> = {
  short_text: (field, value) => stringValue(field, value, 200),
  long_text: (field, value) => stringValue(field, value, 20_000),
  integer: integerValue,
  decimal: (field, value) => wrapped(field, value, canonicalDecimal),
  boolean: booleanValue,
  enum: (field, value) => wrapped(field, value, canonicalEnum),
  measurement: (field, value) => wrapped(field, value, canonicalMeasurement),
  date: (field, value) => wrapped(field, value, canonicalDate),
  date_time: (field, value) => wrapped(field, value, canonicalDateTime),
  url: (field, value) => wrapped(field, value, canonicalUrl),
  reference: (field, value) => wrapped(field, value, canonicalReference),
};
/** Validates one primitive wire value and returns its canonical SQLite JSON. */
/** Validates a value against its persisted field definition and serializes it canonically. */
export function canonicalizeValue(field: ValueFieldDefinition, value: unknown): CanonicalValue {
  return VALIDATORS[field.kind](field, value);
}
/** Parses a stored value and rejects non-canonical JSON encodings. */
/** Parses and validates a canonical stored value for the supplied field definition. */
export function parseCanonicalValue(
  field: ValueFieldDefinition,
  valueJson: string
): CanonicalValue {
  let value: unknown;
  try {
    value = JSON.parse(valueJson);
  } catch {
    throw invalid(field, 'contains invalid JSON');
  }
  const canonical = canonicalizeValue(field, value);
  if (canonical.valueJson !== valueJson) throw invalid(field, 'is not canonically encoded');
  return canonical;
}
