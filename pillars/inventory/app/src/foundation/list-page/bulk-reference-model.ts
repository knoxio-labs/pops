import { descendantIds } from '../../lib/type-tree.js';

import type { FieldWireValue } from '../../inventory-web/commands.js';
import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';
import type { ReferenceChoice } from '../../pages/item-form/field-model';

/** Typed reference choices accepted by the bulk field editor. */
export type BulkReferenceInput = readonly ReferenceChoice[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isReferenceChoice(value: unknown): value is ReferenceChoice {
  if (!isRecord(value)) return false;
  const typeId = value.typeId;
  const typeName = value.typeName;
  return (
    typeof value.id === 'string' &&
    (value.kind === 'item' || value.kind === 'location') &&
    typeof value.label === 'string' &&
    (typeId === undefined || typeId === null || typeof typeId === 'string') &&
    (typeName === undefined || typeName === null || typeof typeName === 'string')
  );
}

/** Returns whether a value contains typed reference choices. */
export function isBulkReferenceInput(input: unknown): input is BulkReferenceInput {
  return Array.isArray(input) && input.every(isReferenceChoice);
}

function referenceChoiceIsAllowed(
  field: CatalogueType['fields'][number],
  choice: ReferenceChoice,
  types: readonly CatalogueType[]
): boolean {
  if (!field.referenceKinds.includes(choice.kind)) return false;
  if (choice.kind === 'location' || field.referenceTypeIds.length === 0) return true;
  if (choice.typeId === undefined || choice.typeId === null) return false;
  const allowedTypeIds = new Set(
    field.referenceTypeIds.flatMap((typeId) => [typeId, ...descendantIds(types, typeId)])
  );
  return allowedTypeIds.has(choice.typeId);
}

/** Encodes typed bulk reference choices as stable catalogue wire values. */
export function encodeBulkReferenceValues(
  field: CatalogueType['fields'][number],
  input: unknown,
  types: readonly CatalogueType[] = []
): readonly FieldWireValue[] | null {
  if (!isBulkReferenceInput(input) || input.length === 0) return null;
  if (field.cardinality === 'one' && input.length > 1) return null;
  const keys = new Set<string>();
  if (
    input.some((choice) => {
      const key = `${choice.kind}:${choice.id}`;
      if (keys.has(key) || !referenceChoiceIsAllowed(field, choice, types)) return true;
      keys.add(key);
      return false;
    })
  )
    return null;
  return input.map(({ id, kind }) => ({ targetId: id, targetKind: kind }));
}
