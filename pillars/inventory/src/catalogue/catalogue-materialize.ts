import {
  asCardinality,
  asPrimitiveKind,
  asReferenceKinds,
  asStorage,
} from './catalogue-field-shape.js';
import { parseObject, parseStringArray } from './catalogue-json.js';

import type { fieldEnumOptions, itemTypeFields, itemTypes } from '../db/schema.js';
import type {
  PersistedEnumOption,
  PersistedItemType,
  PersistedItemTypeField,
} from './catalogue-types.js';

export function materializeType(
  typeRow: typeof itemTypes.$inferSelect,
  fieldRows: readonly (typeof itemTypeFields.$inferSelect)[],
  optionRows: readonly (typeof fieldEnumOptions.$inferSelect)[]
): PersistedItemType {
  const fields = fieldRows
    .filter((field) => field.typeId === typeRow.id)
    .map((field) => materializeField(field, optionRows))
    .toSorted(
      (left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key)
    );
  return {
    revision: typeRow.revision,
    id: typeRow.id,
    key: typeRow.key,
    label: typeRow.label,
    description: typeRow.description,
    sortOrder: typeRow.sortOrder,
    capabilities: parseStringArray(typeRow.capabilitiesJson, `type ${typeRow.id} capabilities`),
    legacyLabels: parseStringArray(typeRow.legacyLabelsJson, `type ${typeRow.id} legacy labels`),
    presentation: parseObject(typeRow.presentationJson, `type ${typeRow.id} presentation`),
    archivedAt: typeRow.archivedAt,
    fields,
  };
}

function materializeField(
  field: typeof itemTypeFields.$inferSelect,
  optionRows: readonly (typeof fieldEnumOptions.$inferSelect)[]
): PersistedItemTypeField {
  const enumOptions = optionRows
    .filter((option) => option.fieldId === field.id)
    .map((option): PersistedEnumOption => ({
      id: option.id,
      key: option.key,
      label: option.label,
      sortOrder: option.sortOrder,
      archivedAt: option.archivedAt,
    }))
    .toSorted(
      (left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key)
    );
  const enumOptionIds = new Set(enumOptions.map((option) => option.id));
  const archivedEnumOptionIds = new Set(
    enumOptions.filter((option) => option.archivedAt !== null).map((option) => option.id)
  );
  return {
    id: field.id,
    typeId: field.typeId,
    key: field.key,
    label: field.label,
    help: field.help,
    sortOrder: field.sortOrder,
    kind: asPrimitiveKind(field.kind, field.id),
    cardinality: asCardinality(field.cardinality, field.id),
    required: field.required === 1,
    storage: asStorage(field.storage, field.id),
    fixedUnit: field.fixedUnit,
    referenceKinds: asReferenceKinds(field.referenceKindsJson, field.id),
    referenceTypeIds: new Set(
      parseStringArray(field.referenceTypeIdsJson, `field ${field.id} reference type ids`)
    ),
    expressionVersion: field.expressionVersion,
    expressionJson: field.expressionJson,
    allowOverride: field.allowOverride === 1,
    presentation: parseObject(field.presentationJson, `field ${field.id} presentation`),
    archivedAt: field.archivedAt,
    enumOptionIds,
    archivedEnumOptionIds,
    enumOptions,
  };
}
