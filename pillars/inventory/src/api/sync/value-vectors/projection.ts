/** Reads a vector item back through `toSyncItem`, the production sync projection. */
import { eq } from 'drizzle-orm';

import { items } from '../../../db/index.js';
import { loadItemExtras, toSyncItem } from '../wire.js';

import type { SyncComputedValue } from '../../../contract/rest-sync-computed-schemas.js';
import type { CommandDb } from '../../../domain/commands/entities.js';
import type { SyncItem, SyncItemFieldValue } from '../wire.js';

export function projectItem(db: CommandDb, itemId: string): SyncItem {
  const row = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!row) throw new Error(`item ${itemId} was not created`);
  return toSyncItem(row, loadItemExtras(db, [itemId]), true);
}

export function fieldValueOf(item: SyncItem, fieldId: string): SyncItemFieldValue | null {
  return item.fieldValues.find((entry) => entry.fieldId === fieldId) ?? null;
}

export function computedValueOf(item: SyncItem, fieldId: string): SyncComputedValue | null {
  return item.computedValues.find((entry) => entry.fieldId === fieldId) ?? null;
}
