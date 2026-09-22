/**
 * Synchronous reads of persisted catalogue snapshots.
 *
 * This module deliberately has no dependency on `src/types`: after the
 * bootstrap migration, the SQLite snapshot is the sole catalogue authority.
 */
import { and, desc, eq } from 'drizzle-orm';

import { catalogueRevisions, fieldEnumOptions, itemTypeFields, itemTypes } from '../db/schema.js';
import {
  asCardinality,
  asPrimitiveKind,
  asReferenceKinds,
  asStorage,
} from './catalogue-field-shape.js';
import { parseObject, parseStringArray } from './catalogue-json.js';

import type { CommandDb } from '../domain/commands/entities.js';
import type {
  PersistedCatalogue,
  PersistedCatalogueRevision,
  PersistedEnumOption,
  PersistedItemType,
  PersistedItemTypeField,
  PersistedTypeLookup,
} from './catalogue-types.js';
export { CatalogueDataError } from './catalogue-error.js';
import { CatalogueDataError } from './catalogue-error.js';

export type {
  PersistedCatalogue,
  PersistedCatalogueRevision,
  PersistedEnumOption,
  PersistedItemType,
  PersistedItemTypeField,
  PersistedTypeLookup,
} from './catalogue-types.js';

function asRevision(row: typeof catalogueRevisions.$inferSelect): PersistedCatalogueRevision {
  if (row.status !== 'draft' && row.status !== 'published' && row.status !== 'abandoned') {
    throw new CatalogueDataError(`catalogue revision ${row.revision} has an unsupported status`);
  }
  return {
    revision: row.revision,
    baseRevision: row.baseRevision,
    status: row.status,
    minimumProtocol: row.minimumProtocol,
  };
}

function loadRevision(db: CommandDb, revision?: number): PersistedCatalogueRevision | null {
  const row =
    revision === undefined
      ? db
          .select()
          .from(catalogueRevisions)
          .where(eq(catalogueRevisions.status, 'published'))
          .orderBy(desc(catalogueRevisions.revision))
          .limit(1)
          .get()
      : db
          .select()
          .from(catalogueRevisions)
          .where(
            and(
              eq(catalogueRevisions.revision, revision),
              eq(catalogueRevisions.status, 'published')
            )
          )
          .get();
  return row ? asRevision(row) : null;
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

function materializeType(
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

/**
 * Loads the current published catalogue, or the exact published `revision`.
 * `null` means no such published revision exists; drafts and abandoned
 * revisions are intentionally never observable through this read API.
 */
export function loadPublishedCatalogue(
  db: CommandDb,
  revision?: number
): PersistedCatalogue | null {
  const loadedRevision = loadRevision(db, revision);
  if (!loadedRevision) return null;
  const typeRows = db
    .select()
    .from(itemTypes)
    .where(eq(itemTypes.revision, loadedRevision.revision))
    .all();
  const fieldRows = db
    .select()
    .from(itemTypeFields)
    .where(eq(itemTypeFields.revision, loadedRevision.revision))
    .all();
  const optionRows = db
    .select()
    .from(fieldEnumOptions)
    .where(eq(fieldEnumOptions.revision, loadedRevision.revision))
    .all();
  return {
    revision: loadedRevision,
    types: typeRows
      .map((type) => materializeType(type, fieldRows, optionRows))
      .toSorted(
        (left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key)
      ),
  };
}

/**
 * Resolves a current or exact published type by its stable ID or immutable
 * key. `null` means the requested snapshot or type does not exist.
 */
export function resolvePublishedType(
  db: CommandDb,
  lookup: PersistedTypeLookup,
  revision?: number
): PersistedItemType | null {
  const catalogue = loadPublishedCatalogue(db, revision);
  if (!catalogue) return null;
  return 'id' in lookup
    ? (catalogue.types.find((type) => type.id === lookup.id) ?? null)
    : (catalogue.types.find(
        (type) => type.key.toLocaleLowerCase() === lookup.key.toLocaleLowerCase()
      ) ?? null);
}

/** Resolves a revision-1 type by its protocol-1 key. */
export function resolveProtocol1Type(db: CommandDb, key: string): PersistedItemType | null {
  return resolvePublishedType(db, { key }, 1);
}

/** Resolves a revision-1 type by the stable ID carried on a protocol-1 item. */
export function resolveProtocol1TypeById(db: CommandDb, id: string): PersistedItemType | null {
  return resolvePublishedType(db, { id }, 1);
}
