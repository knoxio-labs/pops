import { effectiveFields } from '../../../lib/type-tree.js';
import { toWireValues } from '../wire-values.js';

import type { CatalogueField, CatalogueType } from '../../../catalogue-editor/types.js';
import type { FieldValueEntry, FieldWireValue } from '../../../inventory-web/commands.js';
import type { RepairCase } from '../sync-model.js';

/** The safe type-change write, or the fitting fields that prevent it. */
export type ChangeTypeWrite =
  | { kind: 'change-type'; typeKey: string; replacement: string; values: FieldValueEntry[] }
  | { kind: 'unmatched'; replacement: string; fields: string[] };

function replacementIdFor(repair: RepairCase): string | null {
  const replacement = repair.held?.values.find(
    (value) => value.fit === 'replaced' && value.replacementTypeId !== undefined
  );
  return replacement?.replacementTypeId ?? null;
}

function fittingValuesFor(repair: RepairCase) {
  return (repair.held?.values ?? []).filter((value) => value.fit === 'fits');
}

function fieldFor(fields: readonly CatalogueField[], id: string): CatalogueField | null {
  return fields.find((field) => field.id === id) ?? null;
}

function matchingFieldFor(
  source: CatalogueField,
  replacementFields: readonly CatalogueField[]
): CatalogueField | null {
  return (
    replacementFields.find(
      (field) =>
        field.archivedAt === null &&
        field.key === source.key &&
        field.kind === source.kind &&
        field.cardinality === source.cardinality
    ) ?? null
  );
}

function isOptionValue(value: FieldWireValue): value is { optionId: string } {
  return typeof value === 'object' && 'optionId' in value;
}

function enumValuesFor(
  values: readonly FieldWireValue[],
  source: CatalogueField,
  target: CatalogueField
): readonly FieldWireValue[] | null {
  if (!values.every(isOptionValue)) return null;
  const mapped: FieldWireValue[] = [];
  for (const value of values) {
    const sourceOption = source.enumOptions.find((option) => option.id === value.optionId);
    if (sourceOption === undefined) return null;
    const targetOption = target.enumOptions.find(
      (option) => option.archivedAt === null && option.key === sourceOption.key
    );
    if (targetOption === undefined) return null;
    mapped.push({ optionId: targetOption.id });
  }
  return mapped;
}

function valueFor(
  held: NonNullable<RepairCase['held']>['values'][number],
  source: CatalogueField,
  target: CatalogueField,
  values: readonly FieldWireValue[]
): FieldValueEntry | null {
  const carried = source.kind === 'enum' ? enumValuesFor(values, source, target) : values;
  return carried === null ? null : { fieldId: target.id, values: carried };
}

type HeldValueResult =
  | { kind: 'value'; value: FieldValueEntry }
  | { kind: 'unmatched' }
  | { kind: 'invalid' };

function heldValueResultFor(
  held: NonNullable<RepairCase['held']>['values'][number],
  sourceFields: readonly CatalogueField[],
  replacementFields: readonly CatalogueField[]
): HeldValueResult {
  if (held.fieldId === undefined || held.values === undefined) return { kind: 'invalid' };
  const wireValues = toWireValues(held.values);
  if (wireValues === null) return { kind: 'invalid' };
  const sourceField = fieldFor(sourceFields, held.fieldId);
  if (sourceField === null) return { kind: 'unmatched' };
  const targetField = matchingFieldFor(sourceField, replacementFields);
  if (targetField === null) return { kind: 'unmatched' };
  const value = valueFor(held, sourceField, targetField, wireValues);
  return value === null ? { kind: 'unmatched' } : { kind: 'value', value };
}

/**
 * Builds a type-replacement write by matching live target fields on stable key and shape. Enum
 * values are remapped by option key; any fitting value that cannot be carried is reported instead.
 */
export function changeTypeWrite(
  repair: RepairCase,
  types: readonly CatalogueType[]
): ChangeTypeWrite | null {
  if (repair.kind !== 'type-replaced' || repair.typeId === undefined) return null;
  const source = types.find((type) => type.id === repair.typeId);
  const replacementId = replacementIdFor(repair);
  if (source === undefined || replacementId === null) return null;
  const replacement = types.find((type) => type.id === replacementId && type.archivedAt === null);
  if (replacement === undefined) return null;

  const fitting = fittingValuesFor(repair);
  const sourceFields = effectiveFields(types, source.id);
  const replacementFields = effectiveFields(types, replacement.id);
  const results = fitting.map((held) => heldValueResultFor(held, sourceFields, replacementFields));
  if (results.some((result) => result.kind === 'invalid')) return null;
  const unmatched = fitting.flatMap((held, index) =>
    results[index]?.kind === 'unmatched' ? [held.field] : []
  );
  if (unmatched.length > 0) {
    return { kind: 'unmatched', replacement: replacement.label, fields: unmatched };
  }
  const values = results.flatMap((result) => (result.kind === 'value' ? [result.value] : []));
  return {
    kind: 'change-type',
    typeKey: replacement.key,
    replacement: replacement.label,
    values,
  };
}
