import { and, asc, inArray, isNotNull } from 'drizzle-orm';

import { ItemValueReader } from '../../catalogue/item-value-reader.js';
import { readIdBatches } from '../../catalogue/read-id-batches.js';
import { itemDocuments, itemPhotos } from '../../db/index.js';
import { loadComputedValues } from './computed-wire.js';
import { loadFieldExtras } from './field-wire.js';

import type { CommandDb } from '../../domain/commands/index.js';
import type { ItemExtras, SyncPhoto } from './wire-types.js';

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

function loadPhotos(db: CommandDb, ids: readonly string[]): Map<string, SyncPhoto[]> {
  const photos = new Map<string, SyncPhoto[]>();
  const rows = readIdBatches(ids).flatMap((batch) =>
    db
      .select()
      .from(itemPhotos)
      .where(and(inArray(itemPhotos.itemId, batch), isNotNull(itemPhotos.mediaSha256)))
      .orderBy(asc(itemPhotos.position), asc(itemPhotos.id))
      .all()
  );
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
  const rows = readIdBatches(ids).flatMap((batch) =>
    db
      .select()
      .from(itemDocuments)
      .where(inArray(itemDocuments.itemId, batch))
      .orderBy(asc(itemDocuments.id))
      .all()
  );
  for (const row of rows) {
    linked.add(row.itemId);
    if (row.title !== null) append(documentTitles, row.itemId, row.title);
  }
  return { documentTitles, linked };
}

/** Loads the item rows' sync extras in the caller's read transaction. */
export function loadItemExtras(db: CommandDb, ids: readonly string[], protocol = 2): ItemExtras {
  if (ids.length === 0) return emptyItemExtras();
  const valueReader = new ItemValueReader(db, ids);
  const fieldExtras = loadFieldExtras(db, ids, protocol, valueReader);
  const computed = loadComputedValues(db, ids, fieldExtras.fieldValues, valueReader);
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
