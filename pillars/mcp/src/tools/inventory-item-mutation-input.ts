import { requiredPositiveInteger } from './inventory-catalogue-input.js';
import { parseCode, parseExternalIds } from './inventory-item-identifiers.js';
import {
  optionalFieldValuePatches,
  optionalUuid,
  requiredCreateFieldValues,
  requiredUuid,
} from './inventory-item-input.js';
import { optionalProvenance } from './inventory-item-provenance.js';
import { nullStr, reqStr } from './utils.js';

import type { ExternalIdInput } from './inventory-item-identifiers.js';
import type { CreateFieldValueInput, FieldValuePatchInput } from './inventory-item-input.js';
import type { LegacyProvenancePatch } from './inventory-item-provenance.js';

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
  readonly code?: string | null;
  readonly provenance?: LegacyProvenancePatch;
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
  readonly code?: string | null;
  readonly provenance?: LegacyProvenancePatch;
}

function parseCreateExtras(
  args: Record<string, unknown>
): Parsed<Pick<CreateItemMutationInput, 'note' | 'code' | 'provenance'>> {
  const code = parseCode(args);
  if (!code.ok) return code;
  const note = nullStr(args, 'note');
  if ('note' in args && note === undefined) return { ok: false, error: 'Invalid field: note' };
  const provenance = optionalProvenance(args, false);
  if (!provenance.ok) return provenance;
  return {
    ok: true,
    value: {
      ...(note === undefined ? {} : { note }),
      ...(code.value === undefined ? {} : { code: code.value }),
      ...(provenance.value === undefined ? {} : { provenance: provenance.value }),
    },
  };
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
  const extras = parseCreateExtras(args);
  if (!extras.ok) return extras;
  return {
    ok: true,
    value: {
      itemName,
      catalogueRevision: revision.value,
      typeId: typeId.value,
      fieldValues: fieldValues.value,
      ...(entityId.value === undefined ? {} : { entityId: entityId.value }),
      ...(mutationId.value === undefined ? {} : { mutationId: mutationId.value }),
      ...extras.value,
    },
  };
}

function parseUpdateText(
  args: Record<string, unknown>
): Parsed<Pick<UpdateItemMutationInput, 'itemName' | 'note' | 'code'>> {
  let itemName: string | undefined;
  if ('itemName' in args) {
    const parsed = reqStr(args, 'itemName');
    if (parsed === null) return { ok: false, error: 'Invalid field: itemName' };
    itemName = parsed;
  }
  const code = parseCode(args);
  if (!code.ok) return code;
  const note = nullStr(args, 'note');
  if ('note' in args && note === undefined) return { ok: false, error: 'Invalid field: note' };
  return {
    ok: true,
    value: {
      ...(itemName === undefined ? {} : { itemName }),
      ...(note === undefined ? {} : { note }),
      ...(code.value === undefined ? {} : { code: code.value }),
    },
  };
}

function parseUpdateFields(
  args: Record<string, unknown>
): Parsed<Pick<UpdateItemMutationInput, 'fieldValues' | 'externalIds' | 'provenance'>> {
  const fieldValues = optionalFieldValuePatches(args);
  if (!fieldValues.ok) return fieldValues;
  const externalIds = parseExternalIds(args);
  if (!externalIds.ok) return externalIds;
  const provenance = optionalProvenance(args, true);
  if (!provenance.ok) return provenance;
  return {
    ok: true,
    value: {
      ...(fieldValues.value === undefined ? {} : { fieldValues: fieldValues.value }),
      ...(externalIds.value === undefined ? {} : { externalIds: externalIds.value }),
      ...(provenance.value === undefined ? {} : { provenance: provenance.value }),
    },
  };
}

function hasUpdateChange(
  text: Pick<UpdateItemMutationInput, 'itemName' | 'note' | 'code'>,
  fields: Pick<UpdateItemMutationInput, 'fieldValues' | 'externalIds' | 'provenance'>
): boolean {
  return (
    text.itemName !== undefined ||
    text.note !== undefined ||
    text.code !== undefined ||
    fields.fieldValues !== undefined ||
    fields.externalIds !== undefined ||
    fields.provenance !== undefined
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
      error:
        'At least one of itemName, note, code, fieldValues, externalIds, or provenance is required',
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
