import { protocol1RangeFields } from './protocol-1-range.js';
import {
  Protocol1ValueError,
  type Protocol1FieldValue,
  type Protocol1Fields,
} from './protocol-1-types.js';
import { parseCanonicalValue } from './value-dispatch.js';
import { ValueValidationError } from './value-types.js';

import type { ItemFieldValueRow } from '../db/row-types.js';
import type { PersistedItemTypeField } from './catalogue.js';

function objectValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionValue(value: unknown): value is { readonly optionId: string } {
  return objectValue(value) && typeof value['optionId'] === 'string';
}

function measurementValue(
  value: unknown
): value is { readonly amount: string; readonly unit: string } {
  return (
    objectValue(value) && typeof value['amount'] === 'string' && typeof value['unit'] === 'string'
  );
}

function projectValue(field: PersistedItemTypeField, valueJson: string): Protocol1FieldValue {
  const readable =
    field.kind === 'enum' ? { ...field, archivedEnumOptionIds: new Set<string>() } : field;
  const value = parseCanonicalValue(readable, valueJson).value;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (optionValue(value)) {
    const option = field.enumOptions.find((candidate) => candidate.id === value.optionId);
    if (!option) throw new Protocol1ValueError(field.key, 'contains an unknown enum option');
    return option.label;
  }
  if (measurementValue(value)) {
    const amount = Number(value.amount);
    if (!Number.isFinite(amount)) {
      throw new Protocol1ValueError(field.key, 'cannot be represented by protocol 1');
    }
    return { value: amount, unit: value.unit };
  }
  throw new Protocol1ValueError(field.key, `cannot be represented by protocol 1 (${field.kind})`);
}

/** A stored value that could not be represented by a compatibility projection. */
export interface Protocol1ProjectionIssue {
  readonly fieldId: string | null;
  readonly fieldKey: string | null;
  readonly code: string;
  readonly message: string;
}

/** A protocol-1 field projection and the non-fatal issues found while building it. */
export interface Protocol1Projection {
  readonly fields: Protocol1Fields;
  readonly issues: readonly Protocol1ProjectionIssue[];
}

function projectionIssue(
  field: PersistedItemTypeField | undefined,
  fieldId: string,
  error: unknown
): Protocol1ProjectionIssue {
  if (error instanceof ValueValidationError) {
    return {
      fieldId,
      fieldKey: field?.key ?? null,
      code: error.code,
      message: field
        ? `The “${field.label}” value is not available in the current sync catalogue.`
        : 'A field value is not available in the current sync catalogue.',
    };
  }
  if (error instanceof Protocol1ValueError) {
    return {
      fieldId,
      fieldKey: field?.key ?? error.fieldKey,
      code: 'protocol_1_unrepresentable',
      message: field
        ? `The “${field.label}” field cannot be represented by this sync protocol.`
        : 'A field cannot be represented by this sync protocol.',
    };
  }
  throw error;
}

/** Combines a type's two legacy range fields when both values are readable. */
export function projectRange(
  fields: Record<string, Protocol1FieldValue>,
  type: Parameters<typeof protocol1RangeFields>[0]
): void {
  const range = protocol1RangeFields(type);
  if (!range) return;
  const low = fields[range.minimum.key];
  const high = fields[range.maximum.key];
  delete fields[range.minimum.key];
  delete fields[range.maximum.key];
  if (
    objectValue(low) &&
    objectValue(high) &&
    typeof low['value'] === 'number' &&
    typeof high['value'] === 'number' &&
    low['unit'] === high['unit'] &&
    typeof low['unit'] === 'string'
  ) {
    fields['Colour temperature'] = { low: low['value'], high: high['value'], unit: low['unit'] };
  }
}

function appendProjectionIssue(
  issues: Protocol1ProjectionIssue[] | undefined,
  issue: Protocol1ProjectionIssue
): void {
  if (issues !== undefined && !issues.some((existing) => existing.fieldId === issue.fieldId)) {
    issues.push(issue);
  }
}

function cardinalityIssue(
  field: PersistedItemTypeField | undefined,
  fieldId: string
): Protocol1ProjectionIssue {
  return {
    fieldId,
    fieldKey: field?.key ?? null,
    code: 'field_cardinality_unsupported',
    message: field
      ? `The “${field.label}” field has multiple values and cannot be represented by this sync protocol.`
      : 'A field has multiple values and cannot be represented by this sync protocol.',
  };
}

function missingFieldIssue(fieldId: string): Protocol1ProjectionIssue {
  return {
    fieldId,
    fieldKey: null,
    code: 'field_definition_missing',
    message: 'A stored field is not available in the current sync catalogue.',
  };
}

interface LegacyRowProjectionOptions {
  readonly definitions: ReadonlyMap<string, PersistedItemTypeField>;
  readonly multipleValueFieldIds: ReadonlySet<string>;
  readonly cardinality: 'reject' | 'omit';
  readonly issues: Protocol1ProjectionIssue[] | undefined;
}

/** Projects one stored field value into protocol 1, recording an issue when omission is allowed. */
export function projectLegacyRow(
  fields: Record<string, Protocol1FieldValue>,
  row: ItemFieldValueRow,
  options: LegacyRowProjectionOptions
): void {
  const { definitions, multipleValueFieldIds, cardinality, issues } = options;
  if (row.ordinal !== 0 || multipleValueFieldIds.has(row.fieldId)) {
    if (cardinality === 'reject') {
      throw new Protocol1ValueError(row.fieldId, 'has cardinality unsupported by protocol 1');
    }
    appendProjectionIssue(issues, cardinalityIssue(definitions.get(row.fieldId), row.fieldId));
    return;
  }

  const field = definitions.get(row.fieldId);
  if (!field) {
    appendProjectionIssue(issues, missingFieldIssue(row.fieldId));
    return;
  }
  try {
    fields[field.key] = projectValue(field, row.valueJson);
  } catch (error) {
    if (issues === undefined) throw error;
    issues.push(projectionIssue(field, row.fieldId, error));
  }
}
