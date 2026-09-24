import { and, asc, eq, inArray, isNull, notInArray } from 'drizzle-orm';

import {
  computedDependencyIndexState,
  itemComputedDependencies,
  items,
  syncMeta,
} from '../db/schema.js';
import { loadPublishedCatalogue } from './catalogue.js';
import { readEffectiveItemFieldValuesForItems } from './effective-item-values.js';

import type { CommandDb } from '../domain/commands/entities.js';
import type { PersistedCatalogue } from './catalogue-types.js';
import type { EffectiveItemFieldValue } from './item-value-types.js';

/** Whether `catalogue` defines any computed field at all. */
export function hasComputedFields(catalogue: PersistedCatalogue): boolean {
  return catalogue.types.some((type) => type.fields.some((field) => field.storage === 'computed'));
}

function readItemIds(itemId: string, values: readonly EffectiveItemFieldValue[]): Set<string> {
  const read = new Set<string>();
  for (const value of values) {
    if (value.state === 'unavailable') {
      for (const traversed of value.traversedItemIds) read.add(traversed);
    }
    if (value.provenance.source !== 'computed') continue;
    for (const dependency of value.provenance.dependencies) read.add(dependency.itemId);
  }
  read.delete(itemId);
  return read;
}

/**
 * Re-evaluates the computed fields of `itemIds` against `catalogue` and
 * replaces their rows in the reverse-dependency index with every other item
 * the evaluation read or reached, including a deleted or missing reference
 * target, so a later change to any of them finds these items. Runs in the
 * caller's transaction.
 */
export function refreshComputedDependencies(
  db: CommandDb,
  catalogue: PersistedCatalogue,
  itemIds: readonly string[]
): void {
  if (itemIds.length === 0) return;
  db.delete(itemComputedDependencies)
    .where(inArray(itemComputedDependencies.dependentItemId, [...itemIds]))
    .run();
  const effective = readEffectiveItemFieldValuesForItems(db, catalogue, itemIds);
  const rows = [...effective].flatMap(([dependentItemId, values]) =>
    [...readItemIds(dependentItemId, values)].map((dependencyItemId) => ({
      dependencyItemId,
      dependentItemId,
    }))
  );
  if (rows.length > 0) db.insert(itemComputedDependencies).values(rows).run();
}

/**
 * Live items whose indexed computed values read any of `changedItemIds`,
 * excluding those items themselves, ordered by id and capped at `limit`.
 */
export function readComputedDependents(
  db: CommandDb,
  changedItemIds: readonly string[],
  limit: number
): string[] {
  if (changedItemIds.length === 0) return [];
  return db
    .selectDistinct({ id: itemComputedDependencies.dependentItemId })
    .from(itemComputedDependencies)
    .innerJoin(items, eq(items.id, itemComputedDependencies.dependentItemId))
    .where(
      and(
        inArray(itemComputedDependencies.dependencyItemId, [...changedItemIds]),
        notInArray(itemComputedDependencies.dependentItemId, [...changedItemIds]),
        isNull(items.deletedAt)
      )
    )
    .orderBy(asc(itemComputedDependencies.dependentItemId))
    .limit(limit)
    .all()
    .map((row) => row.id);
}

/**
 * Rebuilds the whole reverse-dependency index against `catalogue` and records
 * the revision it was built for. Runs in the caller's transaction: catalogue
 * publication, whose expressions may change every item's dependencies, and
 * the boot backfill after migration `0019_item_computed_dependencies`.
 *
 * A soft-deleted item is excluded, matching `readComputedDependents`: a
 * publication migration only discards a disallowed override from a live
 * item (deleted ones are invisible to it), so evaluating a deleted item's
 * computed fields here could otherwise throw `override_forbidden` and fail
 * the whole publication over data no read path uses until it is restored.
 */
export function rebuildComputedDependencyIndex(db: CommandDb, catalogue: PersistedCatalogue): void {
  db.delete(itemComputedDependencies).run();
  const computedTypeIds = catalogue.types
    .filter((type) => type.fields.some((field) => field.storage === 'computed'))
    .map((type) => type.id);
  if (computedTypeIds.length > 0) {
    const ids = db
      .select({ id: items.id })
      .from(items)
      .where(and(isNull(items.deletedAt), inArray(items.typeId, computedTypeIds)))
      .orderBy(asc(items.id))
      .all()
      .map((row) => row.id);
    refreshComputedDependencies(db, catalogue, ids);
  }
  db.insert(computedDependencyIndexState)
    .values({ id: 1, catalogueRevision: catalogue.revision.revision })
    .onConflictDoUpdate({
      target: computedDependencyIndexState.id,
      set: { catalogueRevision: catalogue.revision.revision },
    })
    .run();
}

function currentCatalogueRevision(db: CommandDb): number | null {
  const row = db.select().from(syncMeta).where(eq(syncMeta.key, 'catalogue_revision')).get();
  return row === undefined ? null : Number.parseInt(row.value, 10);
}

/**
 * Rebuilds the reverse-dependency index in one immediate transaction when it
 * was never built or was built for another published catalogue revision.
 * Returns whether it rebuilt. A boot killed mid-rebuild commits nothing, so
 * the next boot finds the index stale again.
 */
export function ensureComputedDependencyIndex(db: CommandDb): boolean {
  return db.transaction(
    (tx) => {
      const built = tx.select().from(computedDependencyIndexState).get();
      const current = currentCatalogueRevision(tx);
      if (current === null || built?.catalogueRevision === current) return false;
      const catalogue = loadPublishedCatalogue(tx, current);
      if (catalogue === null) return false;
      rebuildComputedDependencyIndex(tx, catalogue);
      return true;
    },
    { behavior: 'immediate' }
  );
}
