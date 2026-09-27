import type { FormFieldDef } from './field-model';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const result = value[key];
  return typeof result === 'string' ? result : null;
}

/** The rendered text and validity of one computed stable value. */
export interface FormattedComputedValue {
  readonly text: string;
  readonly valid: boolean;
}

function formatEnum(field: FormFieldDef, value: unknown): FormattedComputedValue {
  const optionId = stringValue(value, 'optionId');
  const option = field.enumOptions.find((candidate) => candidate.id === optionId);
  return option === undefined
    ? { text: 'Invalid value.', valid: false }
    : { text: option.label, valid: true };
}

function formatMeasurement(field: FormFieldDef, value: unknown): FormattedComputedValue {
  const amount = stringValue(value, 'amount');
  const unit = stringValue(value, 'unit');
  return amount !== null && unit !== null && unit === field.fixedUnit
    ? { text: `${amount} ${unit}`, valid: true }
    : { text: 'Invalid value.', valid: false };
}

function formatReference(value: unknown): FormattedComputedValue {
  const targetId = stringValue(value, 'targetId');
  const targetKind = stringValue(value, 'targetKind');
  return targetId !== null && (targetKind === 'item' || targetKind === 'location')
    ? { text: `${targetKind === 'item' ? 'Item' : 'Place'} ${targetId}`, valid: true }
    : { text: 'Invalid value.', valid: false };
}

function formatBoolean(value: unknown): FormattedComputedValue {
  return typeof value === 'boolean'
    ? { text: value ? 'Yes' : 'No', valid: true }
    : { text: 'Invalid value.', valid: false };
}

function formatInteger(value: unknown): FormattedComputedValue {
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? { text: String(value), valid: true }
    : { text: 'Invalid value.', valid: false };
}

/** Formats one computed stable value according to its catalogue kind. */
export function formatComputedValueResult(
  field: FormFieldDef,
  value: unknown
): FormattedComputedValue {
  switch (field.kind) {
    case 'enum':
      return formatEnum(field, value);
    case 'measurement':
      return formatMeasurement(field, value);
    case 'reference':
      return formatReference(value);
    case 'boolean':
      return formatBoolean(value);
    case 'integer':
      return formatInteger(value);
    default:
      return typeof value === 'string'
        ? { text: value, valid: true }
        : { text: 'Invalid value.', valid: false };
  }
}

/** Formats one computed stable value as the text shown in the form. */
export function formatComputedValue(field: FormFieldDef, value: unknown): string {
  return formatComputedValueResult(field, value).text;
}
