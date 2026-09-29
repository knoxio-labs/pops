import { z } from 'zod';

import {
  externalIdsSchema,
  readPlacement,
  readPreviousPlacement,
} from '../../domain/commands/item-fields.js';
import { jsonValueSchema } from '../../domain/commands/outcome.js';

import type { ItemRow, LocationRow } from '../../db/index.js';
import type { DocumentsClient } from '../documents/client.js';
import type {
  ItemExtras,
  ItemPageRows,
  SyncItem,
  SyncItemIssue,
  SyncItemFieldValue,
  SyncItemProjectionIssue,
  SyncLocation,
} from './wire-types.js';

const fieldsBlobSchema = z.record(z.string(), jsonValueSchema);

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
 * page, and only when some item on it has a link.
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

/** Projects an item row and its page extras onto the sync wire. */
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

/** Projects a location row onto the sync wire. */
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

/** Finishes a page's items after one Paperless availability check. */
export async function projectItems(
  page: ItemPageRows,
  documents: DocumentsClient
): Promise<SyncItem[]> {
  const available = await paperlessAvailable(page.extras, documents);
  return page.items.map((row) => toSyncItem(row, page.extras, available));
}

function projectionIssue(row: ItemRow, issue: SyncItemProjectionIssue): SyncItemIssue {
  return {
    itemId: row.id,
    itemName: row.name,
    seq: row.seq,
    code: issue.code,
    fieldId: issue.fieldId,
    fieldKey: issue.fieldKey,
    message: issue.message,
    itemApplied: true,
    retryable: true,
  };
}

function projectionFailure(row: ItemRow): SyncItemIssue {
  return {
    itemId: row.id,
    itemName: row.name,
    seq: row.seq,
    code: 'item_projection_failed',
    fieldId: null,
    fieldKey: null,
    message: 'This item could not be prepared for sync. No value was changed.',
    itemApplied: false,
    retryable: true,
  };
}

/** Finishes a page while isolating item projection failures into issue rows. */
export async function projectItemsWithIssues(
  page: ItemPageRows,
  documents: DocumentsClient
): Promise<{ readonly items: SyncItem[]; readonly issues: SyncItemIssue[] }> {
  const available = await paperlessAvailable(page.extras, documents);
  const items: SyncItem[] = [];
  const issues: SyncItemIssue[] = [];
  for (const row of page.items) {
    for (const issue of page.extras.projectionIssues.get(row.id) ?? []) {
      issues.push(projectionIssue(row, issue));
    }
    try {
      items.push(toSyncItem(row, page.extras, available));
    } catch (error) {
      console.error('[inventory-sync] item projection failed', { itemId: row.id, error });
      issues.push(projectionFailure(row));
    }
  }
  return { items, issues };
}
