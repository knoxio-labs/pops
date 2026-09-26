import { samePlacement } from '../../foundation/model/placement-model';
import { codeBlocksSave } from './code-assist';
import { valueCount } from './field-model';

import type { Placement } from '../../foundation/model/model';
import type { FormFieldDef, FormTypeDef } from './field-model';
import type { ItemDraft } from './form-draft';

/** A value left behind when a type changes. */
export interface NotCarried {
  readonly fieldId: string;
  readonly label: string;
  readonly count: number;
}

/** The validation and display state derived from a draft. */
export interface FormView {
  readonly type: FormTypeDef | null;
  readonly showQuantity: boolean;
  readonly nameError: string | null;
  readonly quantityError: string | null;
  readonly fieldErrors: Readonly<Record<string, string>>;
  readonly notCarried: readonly NotCarried[];
  readonly blockers: readonly string[];
}

const WHOLE_NUMBER = /^\d+$/u;

function quantityError(draft: ItemDraft, type: FormTypeDef | null): string | null {
  if (type?.containment === true) return null;
  if (!WHOLE_NUMBER.test(draft.quantity.trim())) return 'Quantity needs a whole number.';
  return Number(draft.quantity) >= 1 ? null : 'Quantity is at least 1.';
}

function allFields(types: readonly FormTypeDef[]): ReadonlyMap<string, FormFieldDef> {
  return new Map(types.flatMap((type) => type.fields.map((field) => [field.id, field] as const)));
}

function notCarriedFor(
  draft: ItemDraft,
  type: FormTypeDef | null,
  types: readonly FormTypeDef[]
): NotCarried[] {
  const current = new Set((type?.fields ?? []).map((field) => field.id));
  const fields = allFields(types);
  const ids = new Set([
    ...Object.keys(draft.fields.text),
    ...Object.keys(draft.fields.refs),
    ...Object.keys(draft.fields.booleans),
  ]);
  return [...ids].flatMap((fieldId) => {
    const field = fields.get(fieldId);
    if (field === undefined || current.has(fieldId)) return [];
    const count = valueCount(draft.fields, field);
    return count === 0 ? [] : [{ fieldId, label: field.label, count }];
  });
}

/** Derives validation, visible fields and blockers for the current draft. */
export function deriveForm(draft: ItemDraft, types: readonly FormTypeDef[]): FormView {
  const type = types.find((candidate) => candidate.id === draft.typeId) ?? null;
  const nameError = draft.name.trim() === '' ? 'Name is required.' : null;
  const quantity = quantityError(draft, type);
  const fieldErrors: Readonly<Record<string, string>> = {};
  const blockers = [
    nameError,
    quantity,
    ...Object.values(fieldErrors),
    codeBlocksSave(draft.code),
  ].filter((value): value is string => value !== null);
  return {
    type,
    showQuantity: type?.containment !== true,
    nameError: draft.submitted ? nameError : null,
    quantityError: draft.submitted ? quantity : null,
    fieldErrors,
    notCarried: notCarriedFor(draft, type, types),
    blockers,
  };
}

function sameFields(a: ItemDraft, b: ItemDraft): boolean {
  return JSON.stringify([a.fields, a.overrides]) === JSON.stringify([b.fields, b.overrides]);
}

/** Returns whether cancelling would discard work not present at opening. */
export function hasStagedWork(draft: ItemDraft, initial: ItemDraft): boolean {
  return (
    draft.name !== initial.name ||
    draft.typeId !== initial.typeId ||
    draft.quantity !== initial.quantity ||
    draft.note !== initial.note ||
    draft.code.value !== initial.code.value ||
    !samePlacement(draft.placement, initial.placement) ||
    !sameFields(draft, initial)
  );
}

/** Returns the stable target name used by save-and-new confirmation copy. */
export function placementTargetName(
  world: {
    locations: ReadonlyMap<string, { name: string }>;
    items: ReadonlyMap<string, { name: string }>;
  },
  placement: Placement
): string {
  if (placement.kind === 'in-hand') return 'In hand';
  if (placement.kind === 'location')
    return world.locations.get(placement.locationId)?.name ?? 'Unknown place';
  return world.items.get(placement.containerId)?.name ?? 'Unknown container';
}
