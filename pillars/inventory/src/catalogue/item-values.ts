import { eq } from 'drizzle-orm';

import { itemFieldValues } from '../db/schema.js';
import { ItemValueReader } from './item-value-reader.js';
import { validateItemFieldValues } from './item-value-validation.js';

import type { CommandDb } from '../domain/commands/entities.js';
import type { PersistedItemType } from './catalogue-types.js';
import type {
  CanonicalItemFieldValueInput,
  ItemFieldValueInput,
  ReadItemFieldValue,
} from './item-value-types.js';

export {
  assertIncomingReferencesPermitType,
  IncomingReferenceTypeError,
} from './item-value-references.js';
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

/** Reads canonical values strictly, throwing when a stored row is invalid. */
export function readItemFieldValues(db: CommandDb, itemId: string): readonly ReadItemFieldValue[] {
  return new ItemValueReader(db, [itemId]).read(itemId);
}

/**
 * Reads values for a sync page without letting a structurally valid legacy
 * value, such as an enum option removed from the active catalogue, abort the
 * surrounding page. Values that cannot be represented safely are omitted;
 * the compatibility projection reports the corresponding issue to the client.
 */
export function readItemFieldValuesForSync(
  db: CommandDb,
  itemId: string
): readonly ReadItemFieldValue[] {
  return new ItemValueReader(db, [itemId]).read(itemId, true);
}
