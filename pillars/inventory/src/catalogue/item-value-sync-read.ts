import { parseCanonicalValue } from './value-dispatch.js';

import type { PrimitiveWireValue, ValueFieldDefinition } from './value-types.js';

function objectValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isEnumWireValue(value: Record<string, unknown>): boolean {
  return Object.keys(value).length === 1 && typeof value['optionId'] === 'string';
}

function isMeasurementWireValue(value: Record<string, unknown>): boolean {
  return (
    Object.keys(value).length === 2 &&
    typeof value['amount'] === 'string' &&
    typeof value['unit'] === 'string'
  );
}

function isReferenceWireValue(value: Record<string, unknown>): boolean {
  return (
    Object.keys(value).length === 2 &&
    (value['targetKind'] === 'item' || value['targetKind'] === 'location') &&
    typeof value['targetId'] === 'string'
  );
}

function isPrimitiveWireValue(value: unknown): value is PrimitiveWireValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  return (
    objectValue(value) &&
    (isEnumWireValue(value) || isMeasurementWireValue(value) || isReferenceWireValue(value))
  );
}

/** Parses a stored value, retaining structurally valid values for sync reads. */
export function parseSyncValue(
  field: ValueFieldDefinition,
  valueJson: string,
  preserveStructurallyValidValues: boolean
): PrimitiveWireValue {
  try {
    return parseCanonicalValue({ ...field, archivedEnumOptionIds: new Set<string>() }, valueJson)
      .value;
  } catch (error) {
    if (!preserveStructurallyValidValues || !(error instanceof Error)) throw error;
    let raw: unknown;
    try {
      raw = JSON.parse(valueJson);
    } catch {
      throw error;
    }
    if (!isPrimitiveWireValue(raw)) throw error;
    return raw;
  }
}
