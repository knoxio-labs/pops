import { z } from 'zod';

import {
  clearItemFieldValues,
  ItemFieldSetError,
  loadPublishedCatalogue,
  readItemFieldValues,
  replaceValidatedItemFieldValues,
  validateItemFieldValuesForType,
  ValueValidationError,
} from '../../catalogue/index.js';
import { CommandRejected } from './errors.js';

import type { PersistedCatalogue, PersistedItemType } from '../../catalogue/index.js';
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

/** Whether an event/change key is a stable catalogue field ID. */
export function isActiveFieldName(field: string): boolean {
  return z.uuid().safeParse(field).success;
}

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

/** Loads the current published catalogue and rejects stale stable-ID mutations. */
export function requireActiveCatalogue(db: CommandDb, revision: number): PersistedCatalogue {
  const catalogue = loadPublishedCatalogue(db);
  if (!catalogue) throw new CommandRejected('type_unknown', 'no published catalogue exists');
  if (catalogue.revision.revision !== revision) {
    throw new CommandRejected(
      'catalogue_changed',
      `catalogue revision ${revision} is not active; current revision is ${catalogue.revision.revision}`
    );
  }
  return catalogue;
}

/** Resolves an assignable type by stable ID from the active published revision. */
export function requireActiveType(
  db: CommandDb,
  revision: number,
  typeId: string
): PersistedItemType {
  const type = requireActiveCatalogue(db, revision).types.find((entry) => entry.id === typeId);
  if (!type) throw new CommandRejected('type_unknown', `unknown type ${typeId}`);
  return type;
}

/** Converts client stored values into the authoritative validation shape. */
export function storedFieldValues(values: readonly ActiveFieldValue[]): ItemFieldValueInput[] {
  return values.map((entry) => ({ ...entry, source: 'stored' }));
}

/** Validates a complete authoritative value set and maps failures to command outcomes. */
export function assertActiveFieldValues(
  db: CommandDb,
  type: PersistedItemType,
  values: readonly ItemFieldValueInput[],
  existingItemId?: string
): void {
  try {
    validateItemFieldValuesForType(db, type, values, existingItemId);
  } catch (error) {
    rejectValue(error);
  }
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

/** Reads one stored dynamic field as its event/conflict value. */
export function currentActiveFieldValue(db: CommandDb, itemId: string, fieldId: string): JsonValue {
  const entries = currentAuthoritativeFieldValues(db, itemId).filter(
    (candidate) => candidate.fieldId === fieldId
  );
  const entry = entries.find((candidate) => candidate.source === 'stored') ?? entries[0];
  return entry ? z.array(z.json()).parse(entry.values) : null;
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
  const merged = current.map((entry) => ({ ...entry, values: [...entry.values] }));
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
  const patches = Object.entries(input.changes).map(([fieldId, value]) => ({
    fieldId,
    values: z.array(z.json()).min(1).nullable().parse(value),
  }));
  const values = mergeActiveFieldPatches(current, patches);
  if (typeId === null || typeId === undefined) {
    if (values.length > 0)
      throw new CommandRejected('invalid', 'an untyped item cannot carry values');
    clearItemFieldValues(db, { itemId: input.itemId });
    return;
  }
  const catalogue = loadPublishedCatalogue(db);
  const type = catalogue?.types.find((entry) => entry.id === typeId);
  if (!catalogue || !type) throw new CommandRejected('type_unknown', `unknown type ${typeId}`);
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
