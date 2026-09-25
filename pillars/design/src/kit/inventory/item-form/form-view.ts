/**
 * What the item form shows for a draft: which fields and errors appear,
 * what stops Save and why, which typed values a type change leaves behind,
 * and whether leaving would lose staged work.
 */
import { valueCount } from '../field-editors/field-model';
import { fieldError } from '../field-editors/field-rules';
import { samePlacement } from '../shared/placement-model';
import { codeBlocksSave } from './code-assist';

import type { FormFieldDef, FormTypeDef } from '../field-editors/field-model';
import type { ItemDraft } from './form-draft';

/** A value typed under another type that the chosen type has no field for. */
export interface NotCarried {
  fieldId: string;
  label: string;
  count: number;
}

/** The form as drawn. */
export interface FormView {
  type: FormTypeDef | null;
  showQuantity: boolean;
  nameError: string | null;
  quantityError: string | null;
  fieldErrors: Readonly<Record<string, string>>;
  notCarried: readonly NotCarried[];
  /** Every reason Save is off; the first is the button's tooltip. */
  blockers: readonly string[];
}

const QUANTITY = /^\d+$/u;

function quantityError(draft: ItemDraft, type: FormTypeDef | null): string | null {
  if (type?.containment === true) return null;
  const text = draft.quantity.trim();
  if (!QUANTITY.test(text)) return 'Quantity needs a whole number.';
  return Number(text) >= 1 ? null : 'Quantity is at least 1.';
}

function errorsFor(draft: ItemDraft, type: FormTypeDef | null): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of type?.fields ?? []) {
    if (field.computed !== undefined) continue;
    const error = fieldError(field, draft.fields.text[field.id] ?? []);
    if (error !== null) errors[field.id] = error;
  }
  return errors;
}

function notCarriedFor(
  draft: ItemDraft,
  type: FormTypeDef | null,
  allFields: ReadonlyMap<string, FormFieldDef>
): NotCarried[] {
  const kept = new Set((type?.fields ?? []).map((field) => field.id));
  const ids = [...Object.keys(draft.fields.text), ...Object.keys(draft.fields.refs)];
  return [...new Set(ids)].flatMap((fieldId) => {
    const field = allFields.get(fieldId);
    if (field === undefined || kept.has(fieldId)) return [];
    const count = valueCount(draft.fields, field);
    return count === 0 ? [] : [{ fieldId, label: field.label, count }];
  });
}

/** Every field of every type, by id, for naming values a type change leaves behind. */
export function fieldIndex(types: readonly FormTypeDef[]): Map<string, FormFieldDef> {
  return new Map(types.flatMap((type) => type.fields.map((field) => [field.id, field] as const)));
}

/** Derives the form from its draft and the published types. */
export function deriveForm(draft: ItemDraft, types: readonly FormTypeDef[]): FormView {
  const type = types.find((candidate) => candidate.id === draft.typeId) ?? null;
  const nameMissing = draft.name.trim() === '';
  const fieldErrors = errorsFor(draft, type);
  const quantity = quantityError(draft, type);
  const code = codeBlocksSave(draft.code);
  const blockers = [
    nameMissing ? 'Name is required.' : null,
    quantity,
    code,
    ...Object.values(fieldErrors),
  ].filter((reason): reason is string => reason !== null);
  return {
    type,
    showQuantity: type?.containment !== true,
    nameError: nameMissing && draft.submitted ? 'Name is required.' : null,
    quantityError: quantity,
    fieldErrors,
    notCarried: notCarriedFor(draft, type, fieldIndex(types)),
    blockers,
  };
}

function filledValues(draft: ItemDraft): string {
  const text = Object.entries(draft.fields.text)
    .map(([id, values]) => [id, values.filter((value) => value.trim() !== '')] as const)
    .filter(([, values]) => values.length > 0)
    .toSorted(([a], [b]) => a.localeCompare(b));
  const refs = Object.entries(draft.fields.refs)
    .filter(([, choices]) => choices.length > 0)
    .map(([id, choices]) => [id, choices.map((choice) => choice.id)] as const)
    .toSorted(([a], [b]) => a.localeCompare(b));
  const overrides = Object.entries(draft.overrides).toSorted(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([text, refs, overrides]);
}

function sameValues(a: ItemDraft, b: ItemDraft): boolean {
  return filledValues(a) === filledValues(b);
}

/**
 * Whether leaving now would lose something: any value that differs from
 * where the form started, or a photo not yet uploaded. Cancel asks only then.
 */
export function hasStagedWork(draft: ItemDraft, initial: ItemDraft, stagedPhotos: number): boolean {
  return (
    stagedPhotos > 0 ||
    draft.name !== initial.name ||
    draft.typeId !== initial.typeId ||
    draft.quantity !== initial.quantity ||
    draft.note !== initial.note ||
    draft.code.value !== initial.code.value ||
    !samePlacement(draft.placement, initial.placement) ||
    !sameValues(draft, initial)
  );
}
