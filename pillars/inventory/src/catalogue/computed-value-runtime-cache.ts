import { ComputedValueCache } from './expression-cache.js';

import type { CommandDb } from '../domain/commands/entities.js';

const caches = new WeakMap<CommandDb, ComputedValueCache>();

/** Returns the disposable computed-value cache scoped to one Inventory database. */
export function computedValueCacheFor(db: CommandDb): ComputedValueCache {
  const current = caches.get(db);
  if (current !== undefined) return current;
  const created = new ComputedValueCache(2_048);
  caches.set(db, created);
  return created;
}

/** Invalidates cached subjects and reverse dependencies touched by an item write. */
export function invalidateComputedItem(db: CommandDb, itemId: string): void {
  computedValueCacheFor(db).invalidateItem(itemId);
}

/** Drops every process-local computed result after catalogue publication. */
export function clearComputedValueCache(db: CommandDb): void {
  computedValueCacheFor(db).clear();
}
