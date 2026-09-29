import { and, asc, inArray, isNotNull } from 'drizzle-orm';

import {
  loadLegacyFieldsWithIssues,
  readItemFieldValuesForSync,
  resolveProtocol1TypeById,
  type Protocol1Fields,
  type ReadItemFieldValue,
} from '../../catalogue/index.js';
import { itemDocuments, itemPhotos, items } from '../../db/index.js';
import { loadComputedValues } from './computed-wire.js';

import type { CommandDb } from '../../domain/commands/index.js';
import type { ItemExtras, SyncItemProjectionIssue, SyncPhoto } from './wire-types.js';

export type {
  ItemExtras,
  ItemPageRows,
  SyncItem,
  SyncItemFieldValue,
  SyncItemIssue,
  SyncItemProjectionIssue,
  SyncLocation,
} from './wire-types.js';
export {
  paperlessAvailable,
  projectItems,
  projectItemsWithIssues,
  toSyncItem,
  toSyncLocation,
} from './wire-items.js';

type FieldExtras = Pick<ItemExtras, 'fields' | 'fieldValues' | 'typeKeys' | 'projectionIssues'>;
type DocumentExtras = Pick<ItemExtras, 'documentTitles' | 'linked'>;

function append<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function emptyItemExtras(): ItemExtras {
  return {
    fields: new Map(),
    fieldValues: new Map(),
    computedValues: new Map(),
    typeKeys: new Map(),
    photos: new Map(),
    documentTitles: new Map(),
    linked: new Set(),
    projectionIssues: new Map(),
  };
}

function projectionIssue(code: string, message: string): SyncItemProjectionIssue {
  return { fieldId: null, fieldKey: null, code, message };
}

function syncProjectionIssues(
  issues: readonly SyncItemProjectionIssue[],
  fieldValues: readonly ReadItemFieldValue[],
  protocol: number
): readonly SyncItemProjectionIssue[] {
  if (protocol < 2) return issues;
  const canonicalFieldIds = new Set(fieldValues.map((field) => field.fieldId));
  return issues.filter(
    (issue) =>
      issue.code !== 'field_definition_missing' ||
      issue.fieldId === null ||
      !canonicalFieldIds.has(issue.fieldId)
  );
}

function loadFieldExtras(db: CommandDb, ids: readonly string[], protocol: number): FieldExtras {
  const fields = new Map<string, Protocol1Fields>();
  const fieldValues = new Map<string, readonly ReadItemFieldValue[]>();
  const typeKeys = new Map<string, string | null>();
  const projectionIssues = new Map<string, SyncItemProjectionIssue[]>();
  const itemTypes = db
    .select({ id: items.id, typeId: items.typeId })
    .from(items)
    .where(inArray(items.id, [...ids]))
    .all();

  for (const item of itemTypes) {
    const issues: SyncItemProjectionIssue[] = [];
    let legacyProjectionIssues: readonly SyncItemProjectionIssue[] = [];
    try {
      const projection = loadLegacyFieldsWithIssues(db, item.id, protocol);
      fields.set(item.id, projection.fields);
      legacyProjectionIssues = projection.issues;
    } catch (error) {
      console.error('[inventory-sync] legacy projection failed', { itemId: item.id, error });
      fields.set(item.id, {});
      issues.push(
        projectionIssue(
          'legacy_projection_failed',
          'A compatibility value could not be prepared for sync. No value was changed.'
        )
      );
    }
    try {
      const canonicalValues = readItemFieldValuesForSync(db, item.id);
      fieldValues.set(item.id, canonicalValues);
      issues.push(...syncProjectionIssues(legacyProjectionIssues, canonicalValues, protocol));
    } catch (error) {
      console.error('[inventory-sync] canonical projection failed', { itemId: item.id, error });
      fieldValues.set(item.id, []);
      issues.push(...legacyProjectionIssues);
      issues.push(
        projectionIssue(
          'sync_value_projection_failed',
          'A stored field value could not be prepared for sync. No value was changed.'
        )
      );
    }
    try {
      const type = item.typeId === null ? null : resolveProtocol1TypeById(db, item.typeId);
      typeKeys.set(item.id, type?.key ?? null);
    } catch (error) {
      console.error('[inventory-sync] item type projection failed', { itemId: item.id, error });
      typeKeys.set(item.id, null);
      issues.push(
        projectionIssue(
          'type_projection_failed',
          'The item type could not be prepared for sync. No value was changed.'
        )
      );
    }
    if (issues.length > 0) projectionIssues.set(item.id, issues);
  }
  return { fields, fieldValues, typeKeys, projectionIssues };
}

function loadPhotos(db: CommandDb, ids: readonly string[]): Map<string, SyncPhoto[]> {
  const photos = new Map<string, SyncPhoto[]>();
  const rows = db
    .select()
    .from(itemPhotos)
    .where(and(inArray(itemPhotos.itemId, [...ids]), isNotNull(itemPhotos.mediaSha256)))
    .orderBy(asc(itemPhotos.position), asc(itemPhotos.id))
    .all();
  for (const row of rows) {
    if (row.mediaSha256 !== null) {
      append(photos, row.itemId, { sha256: row.mediaSha256, caption: row.caption });
    }
  }
  return photos;
}

function loadDocumentExtras(db: CommandDb, ids: readonly string[]): DocumentExtras {
  const documentTitles = new Map<string, string[]>();
  const linked = new Set<string>();
  const rows = db
    .select()
    .from(itemDocuments)
    .where(inArray(itemDocuments.itemId, [...ids]))
    .orderBy(asc(itemDocuments.id))
    .all();
  for (const row of rows) {
    linked.add(row.itemId);
    if (row.title !== null) append(documentTitles, row.itemId, row.title);
  }
  return { documentTitles, linked };
}

/** Loads the item rows' sync extras in the caller's read transaction. */
export function loadItemExtras(db: CommandDb, ids: readonly string[], protocol = 2): ItemExtras {
  if (ids.length === 0) return emptyItemExtras();
  const fieldExtras = loadFieldExtras(db, ids, protocol);
  const computed = loadComputedValues(db, ids, fieldExtras.fieldValues);
  const projectionIssues = new Map(fieldExtras.projectionIssues);
  for (const [itemId, issues] of computed.issues) {
    projectionIssues.set(itemId, [...(projectionIssues.get(itemId) ?? []), ...issues]);
  }
  return {
    ...fieldExtras,
    computedValues: computed.values,
    projectionIssues,
    photos: loadPhotos(db, ids),
    ...loadDocumentExtras(db, ids),
  };
}
