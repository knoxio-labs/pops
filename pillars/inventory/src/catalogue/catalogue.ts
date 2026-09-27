/**
 * Synchronous reads of persisted catalogue snapshots.
 *
 * This module deliberately has no dependency on `src/types`: after the
 * bootstrap migration, the SQLite snapshot is the sole catalogue authority.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';

import { catalogueRevisions, fieldEnumOptions, itemTypeFields, itemTypes } from '../db/schema.js';
import { materializeType } from './catalogue-materialize.js';
import { resolveTypeTree } from './catalogue-tree.js';

import type { CommandDb } from '../db/command-db.js';
import type {
  PersistedCatalogue,
  PersistedCatalogueRevision,
  PersistedItemType,
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
  UnresolvedItemType,
  UnresolvedItemTypeField,
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

function loadRevision(
  db: CommandDb,
  revision: number | undefined,
  statuses: readonly ('draft' | 'published' | 'abandoned')[]
): typeof catalogueRevisions.$inferSelect | undefined {
  const statusFilter =
    statuses.length === 0 ? undefined : inArray(catalogueRevisions.status, [...statuses]);
  const query = db.select().from(catalogueRevisions);
  const filtered = statusFilter === undefined ? query : query.where(statusFilter);
  const row =
    revision === undefined
      ? filtered.orderBy(desc(catalogueRevisions.revision)).limit(1).get()
      : db
          .select()
          .from(catalogueRevisions)
          .where(
            and(
              eq(catalogueRevisions.revision, revision),
              ...(statusFilter === undefined ? [] : [statusFilter])
            )
          )
          .get();
  return row;
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
  return loadCatalogue(db, revision, ['published']);
}

/**
 * Loads a complete persisted catalogue snapshot in one of the requested
 * lifecycle states. Drafts are used only by the authoring API; published
 * snapshots remain the only runtime authority for item reads.
 */
export function loadCatalogue(
  db: CommandDb,
  revision: number | undefined,
  statuses: readonly ('draft' | 'published' | 'abandoned')[]
): PersistedCatalogue | null {
  const loadedRevision = loadRevision(db, revision, statuses);
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
    revision: asRevision(loadedRevision),
    types: resolveTypeTree(
      typeRows.map((type) => materializeType(type, fieldRows, optionRows))
    ).toSorted(
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
