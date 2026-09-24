import { and, asc, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';

import {
  loadProtocol1Fields,
  readItemFieldValues,
  resolveProtocol1TypeById,
  type Protocol1Fields,
  type ReadItemFieldValue,
} from '../../catalogue/index.js';
import {
  itemDocuments,
  itemPhotos,
  items,
  type ItemRow,
  type LocationRow,
} from '../../db/index.js';
import {
  externalIdsSchema,
  readPlacement,
  readPreviousPlacement,
} from '../../domain/commands/item-fields.js';
import { jsonValueSchema } from '../../domain/commands/outcome.js';
import { loadComputedValues } from './computed-wire.js';

import type { SyncComputedValue } from '../../contract/rest-sync-computed-schemas.js';
import type {
  SyncItemSchema,
  SyncItemFieldValueSchema,
  SyncLocationSchema,
  SyncPhotoSchema,
} from '../../contract/rest-sync-schemas.js';
import type { CommandDb } from '../../domain/commands/index.js';
import type { DocumentsClient } from '../documents/client.js';

/** An item on the wire. */
export type SyncItem = z.infer<typeof SyncItemSchema>;
/** A location on the wire. */
export type SyncLocation = z.infer<typeof SyncLocationSchema>;
type SyncPhoto = z.infer<typeof SyncPhotoSchema>;
export type SyncItemFieldValue = z.infer<typeof SyncItemFieldValueSchema>;

const fieldsBlobSchema = z.record(z.string(), jsonValueSchema);

/** What a page needs about its items beyond their own rows. */
export interface ItemExtras {
  /** Protocol-1 field projection per item, loaded in the page's read transaction. */
  readonly fields: ReadonlyMap<string, Protocol1Fields>;
  /** Canonical protocol-2 values grouped under their stable field IDs. */
  readonly fieldValues: ReadonlyMap<string, readonly ReadItemFieldValue[]>;
  /** Effective computed-field values, evaluated against the active catalogue. */
  readonly computedValues: ReadonlyMap<string, readonly SyncComputedValue[]>;
  /** Protocol-1 type key per item, loaded from the same published catalogue snapshot. */
  readonly typeKeys: ReadonlyMap<string, string | null>;
  /** Content-addressed photos per item, in position order. Legacy file-only photos are left out. */
  readonly photos: ReadonlyMap<string, SyncPhoto[]>;
  /** Titles of each linked Paperless document, per item. */
  readonly documentTitles: ReadonlyMap<string, string[]>;
  /** Items with at least one Paperless link, titled or not. */
  readonly linked: ReadonlySet<string>;
}

function append<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Load photos and document links for `ids`, in the caller's (read) transaction. */
export function loadItemExtras(db: CommandDb, ids: readonly string[]): ItemExtras {
  const fields = new Map<string, Protocol1Fields>();
  const fieldValues = new Map<string, readonly ReadItemFieldValue[]>();
  const typeKeys = new Map<string, string | null>();
  const photos = new Map<string, SyncPhoto[]>();
  const documentTitles = new Map<string, string[]>();
  const linked = new Set<string>();
  if (ids.length === 0) {
    return {
      fields,
      fieldValues,
      computedValues: new Map(),
      typeKeys,
      photos,
      documentTitles,
      linked,
    };
  }

  const itemTypes = db
    .select({ id: items.id, typeId: items.typeId })
    .from(items)
    .where(inArray(items.id, [...ids]))
    .all();
  for (const item of itemTypes) {
    fields.set(item.id, loadProtocol1Fields(db, item.id));
    fieldValues.set(item.id, readItemFieldValues(db, item.id));
    const type = item.typeId === null ? null : resolveProtocol1TypeById(db, item.typeId);
    typeKeys.set(item.id, type?.key ?? null);
  }

  const photoRows = db
    .select()
    .from(itemPhotos)
    .where(and(inArray(itemPhotos.itemId, [...ids]), isNotNull(itemPhotos.mediaSha256)))
    .orderBy(asc(itemPhotos.position), asc(itemPhotos.id))
    .all();
  for (const row of photoRows) {
    if (row.mediaSha256 !== null) {
      append(photos, row.itemId, { sha256: row.mediaSha256, caption: row.caption });
    }
  }

  const documentRows = db
    .select()
    .from(itemDocuments)
    .where(inArray(itemDocuments.itemId, [...ids]))
    .orderBy(asc(itemDocuments.id))
    .all();
  for (const row of documentRows) {
    linked.add(row.itemId);
    if (row.title !== null) append(documentTitles, row.itemId, row.title);
  }
  const computedValues = loadComputedValues(db, ids, fieldValues);
  return { fields, fieldValues, computedValues, typeKeys, photos, documentTitles, linked };
}

function protocol2FieldValues(extras: ItemExtras, itemId: string): SyncItemFieldValue[] {
  return (extras.fieldValues.get(itemId) ?? []).map((field) => ({
    fieldId: field.fieldId,
    source: field.source,
    catalogueRevision: field.catalogueRevision,
    values: [...field.values],
  }));
}

function catalogueRevision(values: readonly SyncItemFieldValue[]): number | null {
  const revision = values[0]?.catalogueRevision;
  return revision !== undefined && values.every((value) => value.catalogueRevision === revision)
    ? revision
    : null;
}

/**
 * Whether Paperless can serve the page's linked documents. Asked once per
 * page, and only when some item on it has a link, so a page with no documents
 * never waits on the documents pillar.
 */
export async function paperlessAvailable(
  extras: ItemExtras,
  documents: DocumentsClient
): Promise<boolean> {
  if (extras.linked.size === 0) return true;
  const status = await documents.getPaperlessStatus();
  return status.configured && status.available;
}

function provenanceOf(row: ItemRow): SyncItem['provenance'] {
  const provenance = {
    merchant: row.purchasedFromName,
    price: row.purchasePrice,
    purchasedOn: row.purchaseDate,
    warrantyExpires: row.warrantyExpires,
    transactionUri: row.purchaseTransactionUri,
  };
  return Object.values(provenance).every((value) => value === null) ? null : provenance;
}

function documentsStatusOf(
  row: ItemRow,
  extras: ItemExtras,
  available: boolean
): SyncItem['documentsStatus'] {
  if (!extras.linked.has(row.id)) return 'none';
  return available ? 'linked' : 'unavailable';
}

/** Project an item row, with its page's extras, onto the wire. */
export function toSyncItem(row: ItemRow, extras: ItemExtras, available: boolean): SyncItem {
  const fieldValues = protocol2FieldValues(extras, row.id);
  return {
    id: row.id,
    revision: row.revision,
    seq: row.seq,
    name: row.name,
    typeId: row.typeId,
    catalogueRevision: catalogueRevision(fieldValues),
    typeKey: extras.typeKeys.get(row.id) ?? null,
    legacyType: row.legacyType,
    fieldValues,
    computedValues: [...(extras.computedValues.get(row.id) ?? [])],
    fields: fieldsBlobSchema.parse(extras.fields.get(row.id) ?? {}),
    note: row.note,
    code: row.code,
    externalIds: externalIdsSchema.parse(JSON.parse(row.externalIds)),
    quantity: row.quantity,
    lifecycle: row.lifecycle,
    lifecycleChangedAt: row.lifecycleChangedAt,
    placement: readPlacement(row),
    previousPlacement: readPreviousPlacement(row),
    isContainer: row.isContainer === 1,
    access: row.access,
    isFull: row.isFull === null ? null : row.isFull === 1,
    photos: extras.photos.get(row.id) ?? [],
    provenance: provenanceOf(row),
    documentsStatus: documentsStatusOf(row, extras, available),
    documentTitles: extras.documentTitles.get(row.id) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

/** Project a location row onto the wire. */
export function toSyncLocation(row: LocationRow): SyncLocation {
  return {
    id: row.id,
    revision: row.revision,
    seq: row.seq,
    name: row.name,
    parentId: row.parentId,
    sortOrder: row.sortOrder,
    deletedAt: row.deletedAt,
  };
}

/** Rows a page read, before the asynchronous Paperless check. */
export interface ItemPageRows {
  readonly items: readonly ItemRow[];
  readonly extras: ItemExtras;
}

/** Finish a page's items: one Paperless check, then the projection. */
export async function projectItems(
  page: ItemPageRows,
  documents: DocumentsClient
): Promise<SyncItem[]> {
  const available = await paperlessAvailable(page.extras, documents);
  return page.items.map((row) => toSyncItem(row, page.extras, available));
}
