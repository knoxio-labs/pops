/**
 * Replace-all cache for the shared vocabulary owned by the tags pillar.
 *
 * A response is validated before it reaches this service. The transaction
 * makes the delete and insert one change: a failed write keeps the previous
 * complete cache rather than leaving Purchases with a partial vocabulary.
 */
import { eq } from 'drizzle-orm';

import { sharedTagCache } from '../schema.js';
import { nowIso, type PurchasesDb } from './internal.js';

export interface SharedTagCacheValue {
  readonly tagId: string;
  readonly facet: string;
  readonly name: string;
  readonly archived: boolean;
  readonly mergedIntoId: string | null;
}

/** Atomically replace the cached vocabulary with one validated response. */
export function replaceSharedTagCache(
  db: PurchasesDb,
  tags: readonly SharedTagCacheValue[],
  fetchedAt = nowIso()
): number {
  return db.transaction((tx) => {
    tx.delete(sharedTagCache).run();
    if (tags.length > 0) {
      tx.insert(sharedTagCache)
        .values(
          tags.map((tag) => ({
            ...tag,
            fetchedAt,
          }))
        )
        .run();
    }
    return tags.length;
  });
}

/** Whether the last complete vocabulary refresh knows this shared tag id. */
export function isKnownSharedTag(db: PurchasesDb, tagId: string): boolean {
  return (
    db
      .select({ tagId: sharedTagCache.tagId })
      .from(sharedTagCache)
      .where(eq(sharedTagCache.tagId, tagId))
      .limit(1)
      .get() !== undefined
  );
}
