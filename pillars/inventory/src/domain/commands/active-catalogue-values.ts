import { z } from 'zod';

import {
  clearItemFieldValues,
  ItemFieldSetError,
  loadPublishedCatalogue,
  readItemFieldValues,
  replaceValidatedItemFieldValues,
  ValueValidationError,
} from '../../catalogue/index.js';
import { mergeActiveChanges } from './active-value-write.js';
import { CommandRejected } from './errors.js';

import type { ItemFieldValueInput } from '../../catalogue/item-values.js';
import type { CommandDb, FieldValues } from './entities.js';
import type { JsonValue } from './outcome.js';

/** One stored stable-ID value entry accepted by generic item commands. */
export const activeFieldValueSchema = z.object({
  fieldId: z.string().min(1),
  values: z.array(z.json()).min(1),
});

/** A stable-ID edit entry; `null` removes the optional stored value. */
export const activeFieldPatchSchema = z.object({
  fieldId: z.string().min(1),
  values: z.array(z.json()).min(1).nullable(),
});

/** Parsed complete stored-value input for a stable-ID command. */
export type ActiveFieldValue = z.infer<typeof activeFieldValueSchema>;
/** Parsed per-field stable-ID edit input. */
export type ActiveFieldPatch = z.infer<typeof activeFieldPatchSchema>;

function rejectValue(error: unknown): never {
  if (error instanceof ValueValidationError) {
    const reason =
      error.code === 'target_missing' || error.code === 'reference_type_mismatch'
        ? error.code
        : 'invalid';
    throw new CommandRejected(reason, error.message);
  }
  if (error instanceof ItemFieldSetError) throw new CommandRejected('invalid', error.message);
  throw error;
}

/** Converts client stored values into the authoritative validation shape. */
export function storedFieldValues(values: readonly ActiveFieldValue[]): ItemFieldValueInput[] {
  return values.map((entry) => ({ ...entry, source: 'stored' }));
}

function writableValue(value: JsonValue): JsonValue {
  if (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'targetKind' in value &&
    'targetId' in value
  ) {
    return { targetKind: value.targetKind, targetId: value.targetId };
  }
  return value;
}

/** Reads an item's current authoritative values in a form safe to write again. */
export function currentAuthoritativeFieldValues(
  db: CommandDb,
  itemId: string
): ItemFieldValueInput[] {
  return readItemFieldValues(db, itemId).map((entry) => ({
    fieldId: entry.fieldId,
    source: entry.source,
    values: entry.values.map((value) => writableValue(value as JsonValue)),
  }));
}

/** Projects a complete stored value set onto stable field-ID event keys. */
export function activeStoredChanges(values: readonly ItemFieldValueInput[]): FieldValues {
  const changes: FieldValues = {};
  for (const entry of values) {
    if (entry.source === 'stored') changes[entry.fieldId] = z.array(z.json()).parse(entry.values);
  }
  return changes;
}

/** Projects stored patches onto stable field-ID event keys. */
export function activePatchChanges(patches: readonly ActiveFieldPatch[]): FieldValues {
  const changes: FieldValues = {};
  for (const patch of patches) changes[patch.fieldId] = patch.values;
  return changes;
}

/** Projects a whole-type replacement, including cleared prior field IDs. */
export function activeReplacementChanges(
  current: readonly ItemFieldValueInput[],
  next: readonly ItemFieldValueInput[]
): FieldValues {
  const changes: FieldValues = {};
  for (const entry of current) changes[entry.fieldId] = null;
  Object.assign(changes, activeStoredChanges(next));
  return changes;
}

/** Applies stored-value patches while retaining untouched stored values and overrides. */
export function mergeActiveFieldPatches(
  current: readonly ItemFieldValueInput[],
  patches: readonly ActiveFieldPatch[]
): ItemFieldValueInput[] {
  const merged: ItemFieldValueInput[] = current.map((entry) => ({
    ...entry,
    values: [...entry.values],
  }));
  const seen = new Set<string>();
  for (const patch of patches) {
    if (seen.has(patch.fieldId)) {
      throw new CommandRejected('invalid', `field ${patch.fieldId} is present more than once`);
    }
    seen.add(patch.fieldId);
    const index = merged.findIndex(
      (entry) => entry.fieldId === patch.fieldId && entry.source === 'stored'
    );
    if (patch.values === null) {
      if (index >= 0) merged.splice(index, 1);
    } else if (index >= 0) {
      merged[index] = { fieldId: patch.fieldId, source: 'stored', values: patch.values };
    } else {
      merged.push({ fieldId: patch.fieldId, source: 'stored', values: patch.values });
    }
  }
  return merged;
}

/** Replaces an item's active-catalogue values after its command plan validates them. */
export function writeActiveFieldValues(
  db: CommandDb,
  input: {
    readonly itemId: string;
    readonly currentTypeId: string | null;
    readonly requestedTypeId: JsonValue | undefined;
    readonly changes: FieldValues;
    readonly now: string;
  }
): void {
  let typeId = input.currentTypeId;
  if (input.requestedTypeId !== undefined) {
    const parsedTypeId = z.string().min(1).nullable().safeParse(input.requestedTypeId);
    if (!parsedTypeId.success) {
      throw new CommandRejected('invalid', 'typeId must be a non-empty string or null');
    }
    typeId = parsedTypeId.data;
  }
  const current =
    input.requestedTypeId === undefined ? currentAuthoritativeFieldValues(db, input.itemId) : [];
  if (typeId === null || typeId === undefined) {
    if (Object.values(input.changes).some((value) => value !== null))
      throw new CommandRejected('invalid', 'an untyped item cannot carry values');
    clearItemFieldValues(db, { itemId: input.itemId });
    return;
  }
  const catalogue = loadPublishedCatalogue(db);
  const type = catalogue?.types.find((entry) => entry.id === typeId);
  if (!catalogue || !type) throw new CommandRejected('type_unknown', `unknown type ${typeId}`);
  const values = mergeActiveChanges(current, input.changes, type);
  try {
    replaceValidatedItemFieldValues(db, {
      itemId: input.itemId,
      typeId,
      fields: values,
      catalogueRevision: catalogue.revision.revision,
      now: input.now,
    });
  } catch (error) {
    rejectValue(error);
  }
}
