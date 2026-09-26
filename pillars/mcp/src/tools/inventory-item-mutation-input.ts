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
  readonly externalIds?: readonly ExternalIdInput[];
  readonly mutationId?: string;
  readonly itemName?: string;
  readonly note?: string | null;
}

/** One non-empty external identifier sent as part of an item-edit replacement. */
export interface ExternalIdInput {
  readonly kind: string;
  readonly value: string;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseExternalIds(
  args: Record<string, unknown>
): Parsed<readonly ExternalIdInput[] | undefined> {
  if (args['externalIds'] === undefined) return { ok: true, value: undefined };
  const externalIds = args['externalIds'];
  if (!Array.isArray(externalIds)) return { ok: false, error: 'externalIds must be an array' };

  const parsed: ExternalIdInput[] = [];
  for (const [index, entry] of externalIds.entries()) {
    const path = `externalIds[${String(index)}]`;
    if (!isRecord(entry)) return { ok: false, error: `${path} must be an object` };
    for (const key of Object.keys(entry)) {
      if (key !== 'kind' && key !== 'value') {
        return { ok: false, error: `${path}.${key} is not allowed` };
      }
    }
    const kind = entry['kind'];
    if (typeof kind !== 'string' || kind.length === 0) {
      return { ok: false, error: `${path}.kind must be a non-empty string` };
    }
    const value = entry['value'];
    if (typeof value !== 'string' || value.length === 0) {
      return { ok: false, error: `${path}.value must be a non-empty string` };
    }
    parsed.push({ kind, value });
  }
  return { ok: true, value: parsed };
}

function parseUpdateFields(
  args: Record<string, unknown>
): Parsed<Pick<UpdateItemMutationInput, 'fieldValues' | 'externalIds'>> {
  const fieldValues = optionalFieldValuePatches(args);
  if (!fieldValues.ok) return fieldValues;
  const externalIds = parseExternalIds(args);
  if (!externalIds.ok) return externalIds;
  return {
    ok: true,
    value: {
      ...(fieldValues.value === undefined ? {} : { fieldValues: fieldValues.value }),
      ...(externalIds.value === undefined ? {} : { externalIds: externalIds.value }),
    },
  };
}

function hasUpdateChange(
  text: Pick<UpdateItemMutationInput, 'itemName' | 'note'>,
  fields: Pick<UpdateItemMutationInput, 'fieldValues' | 'externalIds'>
): boolean {
  return (
    text.itemName !== undefined ||
    text.note !== undefined ||
    fields.fieldValues !== undefined ||
    fields.externalIds !== undefined
  );
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
  const fields = parseUpdateFields(args);
  if (!fields.ok) return fields;
  const mutationId = optionalUuid(args, 'mutationId');
  if (!mutationId.ok) return mutationId;
  const text = parseUpdateText(args);
  if (!text.ok) return text;
  if (!hasUpdateChange(text.value, fields.value)) {
    return {
      ok: false,
      error: 'At least one of itemName, note, fieldValues, or externalIds is required',
    };
  }
  return {
    ok: true,
    value: {
      id,
      itemRevision: itemRevision.value,
      catalogueRevision: catalogueRevision.value,
      ...text.value,
      ...fields.value,
      ...(mutationId.value === undefined ? {} : { mutationId: mutationId.value }),
    },
  };
}
