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

type Validator = (field: ValueFieldDefinition, value: unknown, trimText: boolean) => CanonicalValue;

function stringValue(
  field: ValueFieldDefinition,
  value: unknown,
  limit: number,
  trimEdges = true
): CanonicalValue {
  if (typeof value !== 'string')
    throw invalid(field, `must contain 1 to ${limit.toLocaleString()} Unicode scalar values`);
  const canonical = trimEdges ? value.trim() : value;
  const length = scalarLength(canonical);
  if (length < 1 || length > limit)
    throw invalid(field, `must contain 1 to ${limit.toLocaleString()} Unicode scalar values`);
  return { valueJson: JSON.stringify(canonical), value: canonical };
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
  short_text: (field, value, trimText) => stringValue(field, value, 200, trimText),
  long_text: (field, value, trimText) => stringValue(field, value, 20_000, trimText),
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
/**
 * Validates a value against its persisted field definition and serializes it canonically.
 * Text edges are trimmed unless `trimText` is false for expression literals or results.
 */
export function canonicalizeValue(
  field: ValueFieldDefinition,
  value: unknown,
  options: { readonly trimText?: boolean } = {}
): CanonicalValue {
  return VALIDATORS[field.kind](field, value, options.trimText !== false);
}

function canonicalizeStoredValue(field: ValueFieldDefinition, value: unknown): CanonicalValue {
  if (field.kind === 'short_text') return stringValue(field, value, 200, false);
  if (field.kind === 'long_text') return stringValue(field, value, 20_000, false);
  return canonicalizeValue(field, value, { trimText: false });
}

/** Parses canonical stored JSON while preserving historical text edge whitespace on reads. */
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
  const canonical = canonicalizeStoredValue(field, value);
  if (canonical.valueJson !== valueJson) throw invalid(field, 'is not canonically encoded');
  return canonical;
}
