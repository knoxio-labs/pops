/**
 * Canonical validation for values stored in `item_field_values`.
 *
 * Decimal values deliberately remain strings throughout this module. JavaScript
 * numbers are only accepted for the integer wire kind, whose domain is bounded
 * to safe integers by the persisted catalogue contract.
 */

export * from './value-types.js';
import { ValueValidationError } from './value-types.js';

import type {
  EnumWireValue,
  MeasurementWireValue,
  ReferenceWireValue,
  ValueFieldDefinition,
} from './value-types.js';

const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function invalid(field: ValueFieldDefinition, message: string): ValueValidationError {
  return new ValueValidationError('invalid_value', field.id, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactObject(
  field: ValueFieldDefinition,
  value: unknown,
  keys: readonly string[]
): Record<string, unknown> {
  if (!isRecord(value)) throw invalid(field, 'must be an object');
  const actualKeys = Object.keys(value).toSorted();
  const expectedKeys = [...keys].toSorted();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw invalid(field, `must have exactly these keys: ${expectedKeys.join(', ')}`);
  }
  return value;
}

export function scalarLength(value: string): number {
  return Array.from(value).length;
}

export function canonicalDecimal(field: ValueFieldDefinition, value: unknown): string {
  if (
    typeof value !== 'string' ||
    !DECIMAL.test(value) ||
    value === '-0' ||
    /^-0\.0+$/u.test(value)
  ) {
    throw new ValueValidationError(
      'invalid_decimal',
      field.id,
      'must be a canonical decimal string'
    );
  }
  const unsignedDigits = value.startsWith('-') ? value.slice(1) : value;
  const significantDigits = unsignedDigits.replace('.', '').replace(/^0+/u, '').length;
  const fraction = unsignedDigits.split('.')[1] ?? '';
  if (significantDigits > 18 || fraction.length > 9) {
    throw new ValueValidationError('precision_overflow', field.id, 'exceeds decimal precision');
  }
  return value;
}

export function canonicalDate(field: ValueFieldDefinition, value: unknown): string {
  if (typeof value !== 'string') throw invalid(field, 'must be a date string');
  const parts = DATE.exec(value);
  if (!parts) throw invalid(field, 'must use YYYY-MM-DD');
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (
    month < 1 ||
    month > 12 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw invalid(field, 'must be a Gregorian calendar date');
  }
  return value;
}

export function canonicalDateTime(field: ValueFieldDefinition, value: unknown): string {
  if (typeof value !== 'string' || !DATE_TIME.test(value)) {
    throw invalid(field, 'must be an RFC 3339 UTC timestamp with milliseconds');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw invalid(field, 'must be a valid RFC 3339 UTC timestamp');
  }
  return value;
}

export function canonicalUrl(field: ValueFieldDefinition, value: unknown): string {
  if (typeof value !== 'string') throw invalid(field, 'must be an HTTPS URL');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw invalid(field, 'must be an HTTPS URL');
  }
  if (parsed.protocol !== 'https:') throw invalid(field, 'must be an HTTPS URL');
  return parsed.href;
}

export function canonicalEnum(field: ValueFieldDefinition, value: unknown): EnumWireValue {
  const object = exactObject(field, value, ['optionId']);
  const optionId = object['optionId'];
  if (typeof optionId !== 'string' || !UUID.test(optionId))
    throw invalid(field, 'must name an enum option UUID');
  if (field.archivedEnumOptionIds.has(optionId)) {
    throw new ValueValidationError(
      'enum_option_archived',
      field.id,
      `enum option ${optionId} is archived`
    );
  }
  if (!field.enumOptionIds.has(optionId)) {
    throw new ValueValidationError(
      'enum_option_unknown',
      field.id,
      `enum option ${optionId} is not declared`
    );
  }
  return { optionId };
}

export function canonicalMeasurement(
  field: ValueFieldDefinition,
  value: unknown
): MeasurementWireValue {
  const object = exactObject(field, value, ['amount', 'unit']);
  if (typeof object['unit'] !== 'string') throw invalid(field, 'measurement unit must be a string');
  if (field.fixedUnit === null || object['unit'] !== field.fixedUnit) {
    throw new ValueValidationError(
      'unit_mismatch',
      field.id,
      'measurement unit does not match the field fixed unit'
    );
  }
  return { amount: canonicalDecimal(field, object['amount']), unit: object['unit'] };
}

export function canonicalReference(
  field: ValueFieldDefinition,
  value: unknown
): ReferenceWireValue {
  const object = exactObject(field, value, ['targetId', 'targetKind']);
  const targetKind = object['targetKind'];
  const targetId = object['targetId'];
  if (
    (targetKind !== 'item' && targetKind !== 'location') ||
    typeof targetId !== 'string' ||
    !UUID.test(targetId)
  ) {
    throw invalid(field, 'must name an item or location UUID');
  }
  if (!field.referenceKinds.has(targetKind)) {
    throw new ValueValidationError(
      'reference_kind_mismatch',
      field.id,
      `does not permit ${targetKind} references`
    );
  }
  return { targetKind, targetId };
}

export { canonicalizeValue, parseCanonicalValue } from './value-dispatch.js';
