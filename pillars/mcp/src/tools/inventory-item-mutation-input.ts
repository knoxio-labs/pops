import { requiredPositiveInteger } from './inventory-catalogue-input.js';
import {
  optionalFieldValuePatches,
  optionalUuid,
  requiredCreateFieldValues,
  requiredUuid,
} from './inventory-item-input.js';
import { nullStr, reqStr } from './utils.js';

import type { CreateFieldValueInput, FieldValuePatchInput } from './inventory-item-input.js';

type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; error: string };

/** Parsed protocol-2 item-create arguments. */
export interface CreateItemMutationInput {
  readonly itemName: string;
  readonly catalogueRevision: number;
  readonly typeId: string;
  readonly fieldValues: readonly CreateFieldValueInput[];
  readonly entityId?: string;
  readonly mutationId?: string;
  readonly note?: string | null;
}

/** Parsed protocol-2 item-edit arguments. */
export interface UpdateItemMutationInput {
  readonly id: string;
  readonly itemRevision: number;
  readonly catalogueRevision: number;
  readonly fieldValues?: readonly FieldValuePatchInput[];
  readonly mutationId?: string;
  readonly itemName?: string;
  readonly note?: string | null;
}

/** Parses and validates the complete item-create argument bag. */
export function parseCreateItemMutationInput(
  args: Record<string, unknown>
): Parsed<CreateItemMutationInput> {
  const itemName = reqStr(args, 'itemName');
  if (!itemName) return { ok: false, error: 'Missing required field: itemName' };
  const revision = requiredPositiveInteger(args, 'catalogueRevision');
  if (!revision.ok) return revision;
  const typeId = requiredUuid(args, 'typeId');
  if (!typeId.ok) return typeId;
  const fieldValues = requiredCreateFieldValues(args);
  if (!fieldValues.ok) return fieldValues;
  const entityId = optionalUuid(args, 'entityId');
  if (!entityId.ok) return entityId;
  const mutationId = optionalUuid(args, 'mutationId');
  if (!mutationId.ok) return mutationId;
  const note = nullStr(args, 'note');
  if ('note' in args && note === undefined) return { ok: false, error: 'Invalid field: note' };
  return {
    ok: true,
    value: {
      itemName,
      catalogueRevision: revision.value,
      typeId: typeId.value,
      fieldValues: fieldValues.value,
      ...(entityId.value === undefined ? {} : { entityId: entityId.value }),
      ...(mutationId.value === undefined ? {} : { mutationId: mutationId.value }),
      ...(note === undefined ? {} : { note }),
    },
  };
}

function parseUpdateText(
  args: Record<string, unknown>
): Parsed<Pick<UpdateItemMutationInput, 'itemName' | 'note'>> {
  let itemName: string | undefined;
  if ('itemName' in args) {
    const parsed = reqStr(args, 'itemName');
    if (parsed === null) return { ok: false, error: 'Invalid field: itemName' };
    itemName = parsed;
  }
  const note = nullStr(args, 'note');
  if ('note' in args && note === undefined) return { ok: false, error: 'Invalid field: note' };
  return {
    ok: true,
    value: {
      ...(itemName === undefined ? {} : { itemName }),
      ...(note === undefined ? {} : { note }),
    },
  };
}

/** Parses and validates an optimistic item-edit argument bag. */
export function parseUpdateItemMutationInput(
  args: Record<string, unknown>
): Parsed<UpdateItemMutationInput> {
  const id = reqStr(args, 'id');
  if (!id) return { ok: false, error: 'Missing required field: id' };
  const itemRevision = requiredPositiveInteger(args, 'revision');
  if (!itemRevision.ok) return itemRevision;
  const catalogueRevision = requiredPositiveInteger(args, 'catalogueRevision');
  if (!catalogueRevision.ok) return catalogueRevision;
  const fieldValues = optionalFieldValuePatches(args);
  if (!fieldValues.ok) return fieldValues;
  const mutationId = optionalUuid(args, 'mutationId');
  if (!mutationId.ok) return mutationId;
  const text = parseUpdateText(args);
  if (!text.ok) return text;
  if (
    text.value.itemName === undefined &&
    text.value.note === undefined &&
    fieldValues.value === undefined
  ) {
    return { ok: false, error: 'At least one of itemName, note, or fieldValues is required' };
  }
  return {
    ok: true,
    value: {
      id,
      itemRevision: itemRevision.value,
      catalogueRevision: catalogueRevision.value,
      ...text.value,
      ...(fieldValues.value === undefined ? {} : { fieldValues: fieldValues.value }),
      ...(mutationId.value === undefined ? {} : { mutationId: mutationId.value }),
    },
  };
}
