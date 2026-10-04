import { asc, eq } from 'drizzle-orm';

import { purchaseItems, purchaseItemSharedTags, sharedTagCache } from '../schema.js';

import type { PurchasesDb } from './internal.js';

/**
 * Return the current shared tag ids for one line item, or null when the line
 * does not exist. The HTTP assignment routes return this after each write.
 */
export function listSharedTagIdsForItem(db: PurchasesDb, itemId: string): string[] | null {
  const item = db
    .select({ id: purchaseItems.id })
    .from(purchaseItems)
    .where(eq(purchaseItems.id, itemId))
    .limit(1)
    .get();
  if (item === undefined) return null;

  return db
    .select({ tagId: purchaseItemSharedTags.tagId })
    .from(purchaseItemSharedTags)
    .where(eq(purchaseItemSharedTags.itemId, itemId))
    .orderBy(asc(purchaseItemSharedTags.tagId))
    .all()
    .map(({ tagId }) => tagId);
}

/** Whether the id is present in the last complete Purchases vocabulary cache. */
export function hasSharedTagId(db: PurchasesDb, tagId: string): boolean {
  return (
    db
      .select({ tagId: sharedTagCache.tagId })
      .from(sharedTagCache)
      .where(eq(sharedTagCache.tagId, tagId))
      .limit(1)
      .get() !== undefined
  );
}
