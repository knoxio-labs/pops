import { and, eq } from 'drizzle-orm';

import { itemFieldValues, items } from '../db/schema.js';
import { loadPublishedCatalogue } from './catalogue.js';
import { assertReferenceTarget } from './item-value-references.js';
import { ItemFieldSetError } from './item-value-types.js';
import { ValueValidationError } from './value-codec.js';
import { canonicalizeValue } from './value-dispatch.js';

import type { ItemFieldValueSource } from '../db/schema.js';
import type { CommandDb } from '../domain/commands/entities.js';
import type { PersistedItemType, PersistedItemTypeField } from './catalogue-types.js';
import type { CanonicalItemFieldValueInput, ItemFieldValueInput } from './item-value-types.js';
import type { CanonicalValue } from './value-types.js';

function existingValueJson(
  db: CommandDb,
  itemId: string | undefined,
  fieldId: string,
  source: ItemFieldValueSource
): readonly string[] {
  if (!itemId) return [];
  return db
    .select({ valueJson: itemFieldValues.valueJson })
    .from(itemFieldValues)
    .where(
      and(
        eq(itemFieldValues.itemId, itemId),
        eq(itemFieldValues.fieldId, fieldId),
        eq(itemFieldValues.source, source)
      )
    )
    .orderBy(itemFieldValues.ordinal)
    .all()
    .map((row) => row.valueJson);
}

function canonicalizeWrite(
  field: PersistedItemTypeField,
  value: unknown,
  remainingExisting: Map<string, number>
): CanonicalValue {
  try {
    return canonicalizeValue(field, value);
  } catch (error) {
    if (error instanceof ValueValidationError && error.code === 'enum_option_archived') {
      const canonical = canonicalizeValue(
        { ...field, archivedEnumOptionIds: new Set<string>() },
        value
      );
      const remaining = remainingExisting.get(canonical.valueJson) ?? 0;
      if (remaining > 0) {
        remainingExisting.set(canonical.valueJson, remaining - 1);
        return canonical;
      }
    }
    throw error;
  }
}

function assertShape(field: PersistedItemTypeField, entry: ItemFieldValueInput): void {
  const sourceValid =
    (field.storage === 'stored' && entry.source === 'stored') ||
    (field.storage === 'computed' && field.allowOverride && entry.source === 'override');
  if (!sourceValid) {
    throw new ItemFieldSetError('source_invalid', field.id, `${entry.source} is not writable`);
  }
  const countValid =
    field.cardinality === 'one' ? entry.values.length === 1 : entry.values.length > 0;
  if (!countValid) {
    const message =
      field.cardinality === 'one' ? 'requires exactly one value' : 'requires at least one value';
    throw new ItemFieldSetError('cardinality_invalid', field.id, message);
  }
}

function validateEntry(
  db: CommandDb,
  field: PersistedItemTypeField,
  entry: ItemFieldValueInput,
  existingItemId?: string
): CanonicalItemFieldValueInput {
  assertShape(field, entry);
  const existing = existingValueJson(db, existingItemId, field.id, entry.source);
  const existingSet = new Set(existing);
  const remainingExisting = new Map<string, number>();
  for (const valueJson of existing) {
    remainingExisting.set(valueJson, (remainingExisting.get(valueJson) ?? 0) + 1);
  }
  if (field.archivedAt !== null && existing.length === 0) {
    throw new ItemFieldSetError('field_archived', field.id, 'cannot receive new values');
  }
  const values = entry.values.map((value) => {
    const canonical = canonicalizeWrite(field, value, remainingExisting);
    if (!existingSet.has(canonical.valueJson)) assertReferenceTarget(db, field, canonical.value);
    return canonical;
  });
  if (
    field.archivedAt !== null &&
    (values.length !== existing.length ||
      values.some((value, index) => value.valueJson !== existing[index]))
  ) {
    throw new ItemFieldSetError('field_archived', field.id, 'can only retain its existing values');
  }
  return { fieldId: entry.fieldId, source: entry.source, values };
}

function assertTypeAssignable(db: CommandDb, type: PersistedItemType, itemId?: string): void {
  if (type.archivedAt === null) return;
  const existingType = itemId
    ? db.select({ typeId: items.typeId }).from(items).where(eq(items.id, itemId)).get()?.typeId
    : null;
  if (existingType !== type.id) {
    throw new ItemFieldSetError('type_archived', type.id, 'cannot be newly assigned');
  }
}

/** Validates a complete field set against a supplied draft or published type definition. */
export function validateItemFieldValuesForType(
  db: CommandDb,
  type: PersistedItemType,
  fields: readonly ItemFieldValueInput[],
  existingItemId?: string
): readonly CanonicalItemFieldValueInput[] {
  assertTypeAssignable(db, type, existingItemId);
  const definitions = new Map(type.fields.map((field) => [field.id, field]));
  const seen = new Set<string>();
  const validated: CanonicalItemFieldValueInput[] = [];
  for (const entry of fields) {
    if (seen.has(entry.fieldId)) {
      throw new ItemFieldSetError('field_duplicate', entry.fieldId, 'is present more than once');
    }
    seen.add(entry.fieldId);
    const field = definitions.get(entry.fieldId);
    if (!field) throw new ItemFieldSetError('field_unknown', entry.fieldId, 'is not declared');
    validated.push(validateEntry(db, field, entry, existingItemId));
  }
  const missing = type.fields.find(
    (field) =>
      field.storage === 'stored' &&
      field.required &&
      field.archivedAt === null &&
      !seen.has(field.id)
  );
  if (missing) throw new ItemFieldSetError('required_missing', missing.id, 'requires a value');
  return validated;
}

/**
 * Validates a complete stable-id field set against one published catalogue snapshot.
 * Archived enum selections may be retained unchanged, but cannot be newly selected.
 */
export function validateItemFieldValues(
  db: CommandDb,
  input: {
    readonly typeId: string;
    readonly catalogueRevision: number;
    readonly fields: readonly ItemFieldValueInput[];
    readonly existingItemId?: string;
  }
): readonly CanonicalItemFieldValueInput[] {
  const type = loadPublishedCatalogue(db, input.catalogueRevision)?.types.find(
    (candidate) => candidate.id === input.typeId
  );
  if (!type) throw new ItemFieldSetError('field_unknown', input.typeId, 'type is not published');
  return validateItemFieldValuesForType(db, type, input.fields, input.existingItemId);
}
