import type { FieldValuePatch, FieldWireValue } from '../../inventory-web/commands';
import type { BulkItemRefusal } from '../../inventory-web/item-verbs-bulk';
import type { FieldDrafts, FormFieldDef } from '../item-form/field-model';

function valuesForField(drafts: FieldDrafts, field: FormFieldDef): readonly string[] {
  if (field.kind === 'boolean') {
    return drafts.booleans[field.id] === undefined ? [] : [String(drafts.booleans[field.id])];
  }
  if (field.kind === 'reference') return (drafts.refs[field.id] ?? []).map((value) => value.id);
  return drafts.text[field.id] ?? [];
}

/** Returns the validation message for an inline catalogue-field draft. */
export function fieldProblem(field: FormFieldDef, drafts: FieldDrafts): string | null {
  const values = valuesForField(drafts, field).filter((value) => value.trim() !== '');
  if (field.required && values.length === 0) return 'This field is required.';
  if (field.kind === 'reference' && field.cardinality === 'one' && values.length > 1) {
    return 'Choose one value.';
  }
  if (field.kind === 'integer' && values.some((value) => !Number.isInteger(Number(value)))) {
    return 'Use a whole number.';
  }
  if (
    field.kind === 'decimal' &&
    values.some((value) => value === '' || !Number.isFinite(Number(value)))
  ) {
    return 'Use a number.';
  }
  if (field.kind === 'enum') {
    const valid = new Set(field.enumOptions.flatMap((option) => [option.id, option.key]));
    if (values.some((value) => !valid.has(value))) return 'Choose a listed value.';
  }
  return null;
}

function wireValues(drafts: FieldDrafts, field: FormFieldDef): readonly FieldWireValue[] {
  if (field.kind === 'boolean') {
    const value = drafts.booleans[field.id];
    return value === undefined ? [] : [value];
  }
  if (field.kind === 'reference') {
    return (drafts.refs[field.id] ?? []).map((reference) => ({
      targetId: reference.id,
      targetKind: reference.kind,
    }));
  }

  return (drafts.text[field.id] ?? [])
    .filter((value) => value.trim() !== '')
    .map((value): FieldWireValue => {
      if (field.kind === 'integer' || field.kind === 'decimal') return Number(value);
      if (field.kind === 'enum') return { optionId: value };
      if (field.kind === 'measurement') return { amount: value, unit: field.fixedUnit ?? '' };
      return value;
    });
}

/** Encodes one inline field draft as the inventory value patch contract. */
export function fieldValuePatch(drafts: FieldDrafts, field: FormFieldDef): FieldValuePatch {
  const values = wireValues(drafts, field);
  return { fieldId: field.id, values: values.length === 0 ? null : values };
}

/** Converts a bulk refusal into inline fact-editor copy. */
export function refusalText(refusal: BulkItemRefusal): string {
  if (refusal.kind === 'no-previous-place') return 'There is no remembered place for this item.';
  if (refusal.kind === 'failed') return refusal.error.message;
  if (refusal.outcome.status === 'rejected') {
    return refusal.outcome.reason || refusal.outcome.message;
  }
  if (refusal.outcome.status === 'deferred') return `Waiting on ${refusal.outcome.waitingOn}.`;
  if ('field' in refusal.outcome && typeof refusal.outcome.field === 'string') {
    return `The ${refusal.outcome.field} changed elsewhere.`;
  }
  return 'The inventory service refused this change.';
}
