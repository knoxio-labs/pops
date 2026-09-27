import type {
  CreateFieldValueEntry,
  FieldValueEntry,
  FieldValuePatch,
  FieldWireValue,
} from '../../inventory-web/commands.js';
import type { FormFieldDef, FormTypeDef } from './field-model';
import type { ItemDraft } from './form-draft';

function dateTimeForWire(value: string): string | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function booleanWireValue(value: string): FieldWireValue | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function integerWireValue(value: string): FieldWireValue | null {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function measurementWireValue(field: FormFieldDef, value: string): FieldWireValue | null {
  return field.fixedUnit === null ? null : { amount: value, unit: field.fixedUnit };
}

function referenceWireValue(field: FormFieldDef, value: string): FieldWireValue | null {
  const targetKind = field.referenceKinds[0];
  return targetKind === undefined ? null : { targetKind, targetId: value };
}

function wireValueForText(field: FormFieldDef, raw: string): FieldWireValue | null {
  const value = field.kind === 'long_text' ? raw : raw.trim();
  if (value === '') return null;
  switch (field.kind) {
    case 'integer':
      return integerWireValue(value);
    case 'boolean':
      return booleanWireValue(value);
    case 'enum':
      return { optionId: value };
    case 'measurement':
      return measurementWireValue(field, value);
    case 'date_time':
      return dateTimeForWire(value);
    case 'reference':
      return referenceWireValue(field, value);
    default:
      return value;
  }
}

function requiredWireValue(field: FormFieldDef, raw: string): FieldWireValue {
  const value = wireValueForText(field, raw);
  if (value === null) throw new Error(`cannot serialize ${field.label}`);
  return value;
}

function wireValuesFor(draft: ItemDraft, field: FormFieldDef): readonly FieldWireValue[] {
  if (field.kind === 'boolean') {
    const value = draft.fields.booleans[field.id];
    return value === undefined ? [] : [value];
  }
  if (field.kind === 'reference') {
    return (draft.fields.refs[field.id] ?? []).map((reference) => ({
      targetId: reference.id,
      targetKind: reference.kind,
    }));
  }
  return (draft.fields.text[field.id] ?? [])
    .filter((value) => value.trim() !== '')
    .map((value) => requiredWireValue(field, value));
}

/** Encodes one stored field from the item form into stable catalogue values. */
export function fieldWireValues(draft: ItemDraft, field: FormFieldDef): readonly FieldWireValue[] {
  return wireValuesFor(draft, field);
}

/** Encodes all stored fields for a type as stable catalogue entries. */
export function draftFieldEntries(
  draft: ItemDraft,
  type: FormTypeDef | null
): readonly FieldValueEntry[] {
  return (type?.fields ?? [])
    .filter((field) => field.storage === 'stored')
    .map((field) => ({ fieldId: field.id, values: fieldWireValues(draft, field) }))
    .filter((entry) => entry.values.length > 0);
}

/** Encodes computed-field overrides for a new item with their required provenance. */
export function draftCreateFieldValues(
  draft: ItemDraft,
  type: FormTypeDef | null
): readonly CreateFieldValueEntry[] {
  const stored = draftFieldEntries(draft, type).map((entry) => ({
    ...entry,
    source: 'stored' as const,
  }));
  const overrides = (type?.fields ?? [])
    .filter((field) => field.storage === 'computed' && field.allowOverride)
    .flatMap((field) => {
      const value = draft.overrides[field.id];
      if (value === undefined || value.trim() === '') return [];
      return [
        {
          fieldId: field.id,
          source: 'override' as const,
          values: [requiredWireValue(field, value)],
        },
      ];
    });
  return [...stored, ...overrides];
}

/** Returns stable stored-field patches, including null entries for cleared values. */
export function draftFieldPatches(
  draft: ItemDraft,
  initial: ItemDraft,
  type: FormTypeDef | null
): readonly FieldValuePatch[] {
  return (type?.fields ?? [])
    .filter((field) => field.storage === 'stored')
    .flatMap((field) => {
      const values = fieldWireValues(draft, field);
      const previous = fieldWireValues(initial, field);
      if (JSON.stringify(values) === JSON.stringify(previous)) return [];
      return [{ fieldId: field.id, values: values.length === 0 ? null : values }];
    });
}

/** One stable override operation required to move from the opening draft to the submitted draft. */
export type DraftOverrideChange =
  | { readonly kind: 'set'; readonly fieldId: string; readonly value: FieldWireValue }
  | { readonly kind: 'clear'; readonly fieldId: string };

/** Returns the computed-field override operations required by an edit. */
export function draftOverrideChanges(
  draft: ItemDraft,
  initial: ItemDraft,
  type: FormTypeDef | null
): readonly DraftOverrideChange[] {
  return (type?.fields ?? [])
    .filter((field) => field.storage === 'computed' && field.allowOverride)
    .flatMap((field): readonly DraftOverrideChange[] => {
      const current = initial.overrides[field.id] ?? '';
      const next = draft.overrides[field.id] ?? '';
      if (current === next) return [];
      if (next.trim() === '') return [{ kind: 'clear' as const, fieldId: field.id }];
      return [{ kind: 'set' as const, fieldId: field.id, value: requiredWireValue(field, next) }];
    });
}
