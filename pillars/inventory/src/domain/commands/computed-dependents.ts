import { and, eq, gt, inArray, max } from 'drizzle-orm';

import {
  hasComputedFields,
  readComputedDependents,
  refreshComputedDependencies,
} from '../../catalogue/computed-dependency-index.js';
import { loadPublishedCatalogue } from '../../catalogue/index.js';
import { events, items } from '../../db/index.js';
import { reindexItems } from './search-index.js';

import type { CommandDb } from './entities.js';

/** Default cap on the dependents one mutation re-sends; see {@link resendComputedDependents}. */
export const DEFAULT_COMPUTED_DEPENDENT_LIMIT = 256;

/** The latest committed `seq`, `0` on an empty log. */
export function latestSeq(db: CommandDb): number {
  return (
    db
      .select({ seq: max(events.seq) })
      .from(events)
      .get()?.seq ?? 0
  );
}

/**
 * After a mutation has appended its item events past `sinceSeq`, re-send
 * every live item whose computed values read one of the changed items
 * (Inventory ADR-002 D5, D9), in the mutation's transaction.
 *
 * The changed items' own index rows are refreshed first, since a reference
 * edit changes what they read. Each dependent then gets its index rows
 * refreshed (a changed intermediate reference reroutes its traversal) and its
 * `seq` stamped with the mutation's last event `seq`, so the change feed
 * carries it in the same page with a fresh evaluation, and its search entry
 * is rewritten with that evaluation. Its `revision` does
 * not move: nothing it owns changed, and a base-revision check against it
 * must not start failing (D8).
 *
 * At most `limit` dependents are re-sent, lowest ids first; the rest keep
 * their evaluation until they next change, which a phone already shows as
 * out of date. Returns the re-sent ids.
 */
export function resendComputedDependents(
  db: CommandDb,
  sinceSeq: number,
  limit: number
): readonly string[] {
  const changed = db
    .selectDistinct({ id: events.entityId })
    .from(events)
    .where(and(gt(events.seq, sinceSeq), eq(events.entityKind, 'item')))
    .all()
    .map((row) => row.id);
  if (changed.length === 0) return [];
  const catalogue = loadPublishedCatalogue(db);
  if (catalogue === null || !hasComputedFields(catalogue)) return [];

  refreshComputedDependencies(db, catalogue, changed);
  const found = readComputedDependents(db, changed, limit + 1);
  if (found.length > limit) {
    console.warn('[inventory] computed dependents exceed the per-mutation re-send limit', {
      changedItemIds: changed,
      limit,
    });
  }
  const dependents = found.slice(0, limit);
  if (dependents.length === 0) return [];
  refreshComputedDependencies(db, catalogue, dependents);
  db.update(items)
    .set({ seq: latestSeq(db) })
    .where(inArray(items.id, dependents))
    .run();
  reindexItems(db, dependents);
  return dependents;
}

/**
 * After `partItemId` joined or left an assembly, refresh the reverse-dependency
 * rows of it and of everything that read it and rewrite their search entries,
 * in the caller's transaction. The caller then drops the part's cached values
 * through its own handle after commit (`invalidateComputedItem`), as
 * `runMutation` does: the cache is per handle, and dropping the part's entries
 * drops every entry that read it. No event is written, so the change feed does
 * not re-send them. Returns the dependents refreshed besides the part, capped
 * at `limit`.
 */
export function refreshAfterAssemblyLinkChange(
  db: CommandDb,
  partItemId: string,
  limit: number = DEFAULT_COMPUTED_DEPENDENT_LIMIT
): readonly string[] {
  const catalogue = loadPublishedCatalogue(db);
  if (catalogue === null || !hasComputedFields(catalogue)) return [];
  refreshComputedDependencies(db, catalogue, [partItemId]);
  const dependents = readComputedDependents(db, [partItemId], limit);
  refreshComputedDependencies(db, catalogue, dependents);
  reindexItems(db, [partItemId, ...dependents]);
  return dependents;
}
