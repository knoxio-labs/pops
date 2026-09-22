/** Atomic copy and clear operations for persisted item values. */
import { and, eq } from 'drizzle-orm';

import { itemFieldValues } from '../db/schema.js';

import type { ItemFieldValueSource } from '../db/schema.js';
import type { CommandDb } from '../domain/commands/entities.js';

/** Removes an item's stored or overridden authoritative values atomically. */
export function clearItemFieldValues(
  db: CommandDb,
  input: { readonly itemId: string; readonly source?: ItemFieldValueSource }
): void {
  db.transaction((tx) => {
    const condition =
      input.source === undefined
        ? eq(itemFieldValues.itemId, input.itemId)
        : and(eq(itemFieldValues.itemId, input.itemId), eq(itemFieldValues.source, input.source));
    tx.delete(itemFieldValues).where(condition).run();
  });
}

/** Copies every persisted value, including override provenance, to another item atomically. */
export function copyItemFieldValues(
  db: CommandDb,
  input: { readonly fromItemId: string; readonly toItemId: string; readonly now: string }
): void {
  db.transaction((tx) => {
    const values = tx
      .select()
      .from(itemFieldValues)
      .where(eq(itemFieldValues.itemId, input.fromItemId))
      .all();
    tx.delete(itemFieldValues).where(eq(itemFieldValues.itemId, input.toItemId)).run();
    for (const value of values) {
      tx.insert(itemFieldValues)
        .values({ ...value, itemId: input.toItemId, createdAt: input.now, updatedAt: input.now })
        .run();
    }
  });
}
