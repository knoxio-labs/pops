import { eq } from 'drizzle-orm';

import { itemFieldValues } from '../db/schema.js';
import { loadPublishedCatalogue } from './catalogue.js';
import { referenceState, referenceValue } from './item-value-references.js';
import { ItemFieldSetError } from './item-value-types.js';
import { validateItemFieldValues } from './item-value-validation.js';
import { parseCanonicalValue } from './value-dispatch.js';

import type { CommandDb } from '../domain/commands/entities.js';
import type { PersistedItemType } from './catalogue-types.js';
import type {
  CanonicalItemFieldValueInput,
  ItemFieldValueInput,
  ReadItemFieldValue,
} from './item-value-types.js';

export { assertIncomingReferencesPermitType } from './item-value-references.js';
export { ItemFieldSetError } from './item-value-types.js';
export {
  validateItemFieldValues,
  validateItemFieldValuesForType,
} from './item-value-validation.js';
export type {
  CanonicalItemFieldValueInput,
  ItemFieldValueInput,
  ReadItemFieldValue,
  ReadReferenceWireValue,
  ReferenceTargetState,
} from './item-value-types.js';

function insertCanonicalValues(
  db: CommandDb,
  input: {
    readonly itemId: string;
    readonly revision: number;
    readonly now: string;
    readonly fields: readonly CanonicalItemFieldValueInput[];
  }
): void {
  for (const field of input.fields) {
    for (const [ordinal, value] of field.values.entries()) {
      db.insert(itemFieldValues)
        .values({
          itemId: input.itemId,
          fieldId: field.fieldId,
          source: field.source,
          ordinal,
          valueJson: value.valueJson,
          catalogueRevision: input.revision,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .run();
    }
  }
}

/**
 * Validates and atomically replaces every authoritative value for an item.
 * `existingItemId` may name a source item whose retained archived values are
 * being copied; otherwise validation compares against the destination item.
 */
export function replaceValidatedItemFieldValues(
  db: CommandDb,
  input: {
    readonly itemId: string;
    readonly existingItemId?: string;
    readonly typeId: string;
    readonly catalogueRevision: number;
    readonly fields: readonly ItemFieldValueInput[];
    readonly now: string;
  }
): readonly CanonicalItemFieldValueInput[] {
  const validated = validateItemFieldValues(db, {
    ...input,
    existingItemId: input.existingItemId ?? input.itemId,
  });
  return db.transaction((tx) => {
    tx.delete(itemFieldValues).where(eq(itemFieldValues.itemId, input.itemId)).run();
    insertCanonicalValues(tx, {
      itemId: input.itemId,
      revision: input.catalogueRevision,
      now: input.now,
      fields: validated,
    });
    return validated;
  });
}

/** Resolves a type from a complete catalogue without consulting code templates. */
export function findCatalogueType(
  types: readonly PersistedItemType[],
  typeId: string
): PersistedItemType | null {
  return types.find((type) => type.id === typeId) ?? null;
}

/**
 * Reads canonical persisted values and annotates references with their current
 * live, deleted, or missing state. Reference ids are never discarded.
 */
export function readItemFieldValues(db: CommandDb, itemId: string): readonly ReadItemFieldValue[] {
  const rows = db
    .select()
    .from(itemFieldValues)
    .where(eq(itemFieldValues.itemId, itemId))
    .orderBy(
      itemFieldValues.fieldId,
      itemFieldValues.source,
      itemFieldValues.catalogueRevision,
      itemFieldValues.ordinal
    )
    .all();
  const result: ReadItemFieldValue[] = [];
  for (const row of rows) {
    const field = loadPublishedCatalogue(db, row.catalogueRevision)
      ?.types.flatMap((type) => type.fields)
      .find((entry) => entry.id === row.fieldId);
    if (!field) {
      throw new ItemFieldSetError('field_unknown', row.fieldId, 'stored definition is unavailable');
    }
    const parsed = parseCanonicalValue(
      { ...field, archivedEnumOptionIds: new Set<string>() },
      row.valueJson
    ).value;
    const reference = referenceValue(parsed);
    const value = reference ? { ...reference, targetState: referenceState(db, reference) } : parsed;
    const previous = result.at(-1);
    if (
      previous?.fieldId === row.fieldId &&
      previous.source === row.source &&
      previous.catalogueRevision === row.catalogueRevision
    ) {
      result[result.length - 1] = { ...previous, values: [...previous.values, value] };
    } else {
      result.push({
        fieldId: row.fieldId,
        source: row.source,
        catalogueRevision: row.catalogueRevision,
        values: [value],
      });
    }
  }
  return result;
}
