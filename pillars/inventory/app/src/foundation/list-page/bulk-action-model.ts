import { effectiveFields } from '../../lib/type-tree.js';
import {
  encodeBulkReferenceValues,
  isBulkReferenceInput,
  type BulkReferenceInput,
} from './bulk-reference-model.js';

import type {
  FieldValueEntry,
  FieldValuePatch,
  FieldWireValue,
} from '../../inventory-web/commands.js';
import type { WebItem } from '../../inventory-web/item-row-model.js';
import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';
import type { ItemRowModel } from '../model/model.js';

/** A catalogue field that can be written to every compatible selected item. */
export interface BulkFieldCandidate {
  readonly field: CatalogueType['fields'][number];
  readonly have: number;
  readonly itemIds: readonly string[];
}

/** The input values supported by the live bulk field sheet. */
export type BulkFieldInput = string | string[] | boolean | BulkReferenceInput;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFieldWireValue(value: unknown): value is FieldWireValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  if (!isRecord(value)) return false;
  if (typeof value.optionId === 'string')
    return Object.keys(value).every((key) => key === 'optionId');
  if (typeof value.amount === 'string' && typeof value.unit === 'string') {
    return Object.keys(value).every((key) => key === 'amount' || key === 'unit');
  }
  return (
    (value.targetKind === 'item' || value.targetKind === 'location') &&
    typeof value.targetId === 'string' &&
    Object.keys(value).every((key) => key === 'targetKind' || key === 'targetId')
  );
}

/** Returns whether the live bulk editor knows how to encode a catalogue field. */
export function supportsBulkField(field: CatalogueType['fields'][number]): boolean {
  return (
    field.archivedAt === null &&
    field.storage === 'stored' &&
    (field.kind !== 'measurement' || field.fixedUnit !== null)
  );
}

function supportsTypeValue(field: CatalogueType['fields'][number]): boolean {
  return field.archivedAt === null && field.storage === 'stored';
}

/** Finds writable fields and the selected rows whose current types declare them. */
export function bulkFieldCandidates(
  rows: readonly ItemRowModel[],
  ids: readonly string[],
  catalogue: { readonly types: readonly CatalogueType[] } | undefined
): BulkFieldCandidate[] {
  if (catalogue === undefined) return [];
  const selected = new Set(ids);
  const fields = new Map<
    string,
    { field: CatalogueType['fields'][number]; itemIds: Set<string> }
  >();
  for (const row of rows) {
    if (!selected.has(row.id) || row.typeId === null) continue;
    const type = catalogue.types.find((candidate) => candidate.id === row.typeId);
    for (const field of type === undefined ? [] : effectiveFields(catalogue.types, type.id)) {
      if (!supportsBulkField(field)) continue;
      const existing = fields.get(field.id);
      if (existing === undefined) {
        fields.set(field.id, { field, itemIds: new Set([row.id]) });
      } else existing.itemIds.add(row.id);
    }
  }
  return [...fields.values()]
    .map(({ field, itemIds }) => ({ field, have: itemIds.size, itemIds: [...itemIds] }))
    .toSorted((left, right) => left.field.label.localeCompare(right.field.label));
}

/** Returns the stable values that survive a selected item's type change. */
export function typeChangeValues(
  items: readonly WebItem[],
  targetType: CatalogueType,
  types: readonly CatalogueType[] = []
): ReadonlyMap<string, readonly FieldValueEntry[]> {
  const resolvedTarget = effectiveFields(types, targetType.id);
  const targetFieldIds = new Set(
    (resolvedTarget.length > 0 ? resolvedTarget : targetType.fields)
      .filter((field) => supportsTypeValue(field))
      .map((field) => field.id)
  );
  return new Map(
    items.map((item) => [
      item.id,
      item.fieldValues
        .filter((entry) => entry.source === 'stored' && targetFieldIds.has(entry.fieldId))
        .flatMap((entry): FieldValueEntry[] => {
          if (!entry.values.every(isFieldWireValue)) return [];
          return [{ fieldId: entry.fieldId, values: entry.values }];
        }),
    ])
  );
}

/** Creates a blank input for a field's editor. */
export function initialBulkFieldInput(field: CatalogueType['fields'][number]): BulkFieldInput {
  if (field.kind === 'boolean') return false;
  if ((field.kind === 'enum' && field.cardinality === 'many') || field.kind === 'reference')
    return [];
  return '';
}

function textInputValues(input: BulkFieldInput): string[] {
  if (typeof input === 'boolean' || isBulkReferenceInput(input)) return [];
  return (Array.isArray(input) ? input : [input]).map((value) => value.trim()).filter(Boolean);
}

function encodeEnumValues(
  field: CatalogueType['fields'][number],
  input: BulkFieldInput
): readonly FieldWireValue[] | null {
  const selected = textInputValues(input);
  const activeOptions = new Set(
    field.enumOptions.filter((option) => option.archivedAt === null).map((option) => option.id)
  );
  if (selected.length === 0 || selected.some((optionId) => !activeOptions.has(optionId))) {
    return null;
  }
  return selected.map((optionId) => ({ optionId }));
}

function encodeNumericValue(
  field: CatalogueType['fields'][number],
  input: BulkFieldInput
): readonly FieldWireValue[] | null {
  const value = textInputValues(input)[0];
  if (value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || (field.kind === 'integer' && !Number.isInteger(number))) {
    return null;
  }
  return [number];
}

function encodeMeasurementValue(
  field: CatalogueType['fields'][number],
  input: BulkFieldInput
): readonly FieldWireValue[] | null {
  const value = textInputValues(input)[0];
  if (value === undefined || field.fixedUnit === null) return null;
  return [{ amount: value, unit: field.fixedUnit }];
}

/** Encodes one bulk field input in the stable catalogue value format. */
export function encodeBulkFieldValues(
  field: CatalogueType['fields'][number],
  input: BulkFieldInput,
  types: readonly CatalogueType[] = []
): readonly FieldWireValue[] | null {
  if (!supportsBulkField(field)) return null;
  if (field.kind === 'boolean') return typeof input === 'boolean' ? [input] : null;
  if (field.kind === 'reference') return encodeBulkReferenceValues(field, input, types);
  if (field.kind === 'enum') return encodeEnumValues(field, input);
  if (field.kind === 'integer' || field.kind === 'decimal') {
    return encodeNumericValue(field, input);
  }
  if (field.kind === 'measurement') return encodeMeasurementValue(field, input);
  const value = textInputValues(input)[0];
  return value === undefined ? null : [value];
}

/** Formats a selected-item count with the correct singular or plural noun. */
export function bulkItemCount(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

/** Returns the labels shared by a row's current type and a proposed type. */
export function sharedTypeFieldLabels(
  row: ItemRowModel,
  targetType: CatalogueType,
  catalogue: { readonly types: readonly CatalogueType[] } | undefined
): string[] {
  if (catalogue === undefined || row.typeId === null) return [];
  const currentType = catalogue.types.find((type) => type.id === row.typeId);
  if (currentType === undefined) return [];
  const currentFields = effectiveFields(catalogue.types, currentType.id);
  const targetFields = effectiveFields(catalogue.types, targetType.id);
  const targetFieldIds = new Set(
    (targetFields.length > 0 ? targetFields : targetType.fields)
      .filter((field) => supportsTypeValue(field))
      .map((field) => field.id)
  );
  return (currentFields.length > 0 ? currentFields : currentType.fields)
    .filter((field) => supportsTypeValue(field) && targetFieldIds.has(field.id))
    .map((field) => field.label);
}

/** Builds a stable patch for one selected item and one chosen field value. */
export function bulkFieldPatch(
  field: CatalogueType['fields'][number],
  input: BulkFieldInput,
  types: readonly CatalogueType[] = []
): FieldValuePatch | null {
  const values = encodeBulkFieldValues(field, input, types);
  return values === null ? null : { fieldId: field.id, values };
}
